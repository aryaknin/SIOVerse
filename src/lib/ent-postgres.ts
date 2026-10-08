import "server-only";

import { Pool } from "pg";
import type { EntCatalog } from "./ent";

const pool = process.env.DATABASE_URL && process.env.SIOVERSE_ENT_STAGE_ONLY !== "1" ? new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1500, max: 4 }) : null;
pool?.on("error", () => { /* A later request will reconnect. */ });
let schemaReady: Promise<void> | null = null;

export function isDatabaseUnavailable(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return !pool || code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENOTFOUND" || code === "EHOSTUNREACH" || code === "EPERM" || code === "28P01" || code === "28000" || code === "3D000";
}

async function ensureSchema() {
  if (!pool) throw Object.assign(new Error("PostgreSQL n’est pas configuré."), { code: "ENOTFOUND" });
  schemaReady ??= (async () => {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ent_subjects (
          id uuid PRIMARY KEY, name text NOT NULL UNIQUE, teacher text NOT NULL,
          color text NOT NULL, created_at timestamptz NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ent_chapters (
          id uuid PRIMARY KEY, subject_id uuid NOT NULL REFERENCES ent_subjects(id) ON DELETE CASCADE,
          parent_id uuid REFERENCES ent_chapters(id) ON DELETE CASCADE,
          title text NOT NULL, position integer NOT NULL,
          UNIQUE(subject_id, parent_id, title)
        );
        CREATE TABLE IF NOT EXISTS ent_resources (
          id uuid PRIMARY KEY, chapter_id uuid NOT NULL REFERENCES ent_chapters(id) ON DELETE CASCADE,
          title text NOT NULL, kind text NOT NULL, teacher text NOT NULL,
          original_name text, mime_type text, stored_name text, external_url text,
          source_key text UNIQUE, size_bytes bigint, created_at timestamptz NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ent_assessments (
          id uuid PRIMARY KEY, kind text NOT NULL, title text NOT NULL,
          subject_id uuid NOT NULL REFERENCES ent_subjects(id) ON DELETE CASCADE,
          scheduled_at timestamptz NOT NULL, details text NOT NULL, room text NOT NULL,
          created_at timestamptz NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ent_assessment_chapters (
          assessment_id uuid NOT NULL REFERENCES ent_assessments(id) ON DELETE CASCADE,
          chapter_id uuid NOT NULL REFERENCES ent_chapters(id) ON DELETE CASCADE,
          PRIMARY KEY(assessment_id, chapter_id)
        );
        CREATE INDEX IF NOT EXISTS ent_chapters_subject_idx ON ent_chapters(subject_id);
        CREATE INDEX IF NOT EXISTS ent_resources_chapter_idx ON ent_resources(chapter_id);
        ALTER TABLE ent_resources ADD COLUMN IF NOT EXISTS size_bytes bigint;
      `);
    } finally { client.release(); }
  })().catch((error) => { schemaReady = null; throw error; });
  await schemaReady;
}

export async function readPostgresCatalog(): Promise<EntCatalog> {
  await ensureSchema();
  if (!pool) throw new Error("PostgreSQL n’est pas configuré.");
  const [subjects, chapters, resources, assessments, links] = await Promise.all([
    pool.query("SELECT id, name, teacher, color, created_at FROM ent_subjects ORDER BY created_at, name"),
    pool.query("SELECT id, subject_id, parent_id, title, position FROM ent_chapters ORDER BY position, title"),
    pool.query("SELECT id, chapter_id, title, kind, teacher, original_name, mime_type, stored_name, external_url, source_key, size_bytes, created_at FROM ent_resources ORDER BY created_at, title"),
    pool.query("SELECT id, kind, title, subject_id, scheduled_at, details, room, created_at FROM ent_assessments ORDER BY scheduled_at"),
    pool.query("SELECT assessment_id, chapter_id FROM ent_assessment_chapters"),
  ]);
  const chapterIds = new Map<string, string[]>();
  for (const row of links.rows) chapterIds.set(row.assessment_id, [...(chapterIds.get(row.assessment_id) ?? []), row.chapter_id]);
  return {
    version: 1,
    subjects: subjects.rows.map((row) => ({ id: row.id, name: row.name, teacher: row.teacher, color: row.color, createdAt: row.created_at.toISOString() })),
    chapters: chapters.rows.map((row) => ({ id: row.id, subjectId: row.subject_id, parentId: row.parent_id, title: row.title, position: row.position })),
    resources: resources.rows.map((row) => ({ id: row.id, chapterId: row.chapter_id, title: row.title, kind: row.kind, teacher: row.teacher, originalName: row.original_name, mimeType: row.mime_type, storedName: row.stored_name, externalUrl: row.external_url, sourceKey: row.source_key, sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes), createdAt: row.created_at.toISOString() })),
    assessments: assessments.rows.map((row) => ({ id: row.id, kind: row.kind, title: row.title, subjectId: row.subject_id, chapterIds: chapterIds.get(row.id) ?? [], scheduledAt: row.scheduled_at.toISOString(), details: row.details, room: row.room, createdAt: row.created_at.toISOString() })),
  } as EntCatalog;
}

export async function savePostgresCatalog(catalog: EntCatalog): Promise<void> {
  await ensureSchema();
  if (!pool) throw new Error("PostgreSQL n’est pas configuré.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const deleted = catalog.deleted;
    if (deleted?.resources.length) await client.query("DELETE FROM ent_resources WHERE id = ANY($1::uuid[])", [deleted.resources]);
    if (deleted?.assessments.length) await client.query("DELETE FROM ent_assessments WHERE id = ANY($1::uuid[])", [deleted.assessments]);
    if (deleted?.chapters.length) await client.query("DELETE FROM ent_chapters WHERE id = ANY($1::uuid[])", [deleted.chapters]);
    if (deleted?.subjects.length) await client.query("DELETE FROM ent_subjects WHERE id = ANY($1::uuid[])", [deleted.subjects]);
    for (const item of catalog.subjects) await client.query(
      "INSERT INTO ent_subjects(id,name,teacher,color,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=$2,teacher=$3,color=$4",
      [item.id, item.name, item.teacher, item.color, item.createdAt],
    );
    const pending = [...catalog.chapters];
    const saved = new Set<string>();
    while (pending.length) {
      const index = pending.findIndex((item) => !item.parentId || saved.has(item.parentId) || !catalog.chapters.some((chapter) => chapter.id === item.parentId));
      if (index < 0) throw new Error("L’arborescence des dossiers contient une boucle.");
      const [item] = pending.splice(index, 1);
      await client.query(
        "INSERT INTO ent_chapters(id,subject_id,parent_id,title,position) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET subject_id=$2,parent_id=$3,title=$4,position=$5",
        [item.id, item.subjectId, item.parentId ?? null, item.title, item.position],
      );
      saved.add(item.id);
    }
    for (const item of catalog.resources) await client.query(
      "INSERT INTO ent_resources(id,chapter_id,title,kind,teacher,original_name,mime_type,stored_name,external_url,source_key,size_bytes,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO UPDATE SET chapter_id=$2,title=$3,kind=$4,teacher=$5,original_name=$6,mime_type=$7,stored_name=$8,external_url=$9,source_key=$10,size_bytes=COALESCE($11,ent_resources.size_bytes)",
      [item.id, item.chapterId, item.title, item.kind, item.teacher, item.originalName, item.mimeType, item.storedName, item.externalUrl, item.sourceKey ?? null, item.sizeBytes ?? null, item.createdAt],
    );
    for (const item of catalog.assessments) {
      await client.query(
        "INSERT INTO ent_assessments(id,kind,title,subject_id,scheduled_at,details,room,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET kind=$2,title=$3,subject_id=$4,scheduled_at=$5,details=$6,room=$7",
        [item.id, item.kind, item.title, item.subjectId, item.scheduledAt, item.details, item.room, item.createdAt],
      );
      await client.query("DELETE FROM ent_assessment_chapters WHERE assessment_id=$1", [item.id]);
      for (const id of item.chapterIds) await client.query("INSERT INTO ent_assessment_chapters(assessment_id,chapter_id) VALUES($1,$2)", [item.id, id]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
