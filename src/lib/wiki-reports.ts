import "server-only";

import { randomUUID } from "node:crypto";
import { ensureWikiSchema } from "./lore";
import { loreDatabase } from "./lore-db";

export type WikiReport = { id: string; articleId: string; articleTitle: string; reason: string; reporterName: string; createdAt: string };
let ready: Promise<void> | null = null;

async function ensureReportsSchema() {
  ready ??= (async () => {
    await ensureWikiSchema();
    await loreDatabase().query(`CREATE TABLE IF NOT EXISTS sio_wiki_reports (
      id uuid PRIMARY KEY,
      article_id uuid NOT NULL REFERENCES sio_lore_entries(id) ON DELETE CASCADE,
      reporter_id uuid NOT NULL REFERENCES sio_users(id) ON DELETE CASCADE,
      reason text NOT NULL,
      status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
      created_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sio_wiki_reports_open_idx ON sio_wiki_reports(article_id,reporter_id) WHERE status='OPEN';`);
  })().catch((error) => { ready = null; throw error; });
  await ready;
}

export async function createWikiReport(articleId: string, reporterId: string, reason: string): Promise<void> {
  await ensureReportsSchema();
  try {
    const result = await loreDatabase().query(`INSERT INTO sio_wiki_reports(id,article_id,reporter_id,reason)
      SELECT $1,e.id,$2,$3 FROM sio_lore_entries e WHERE e.id=$4 AND e.kind='ARTICLE' RETURNING id`, [randomUUID(), reporterId, reason, articleId]);
    if (!result.rowCount) throw new Error("Article introuvable.");
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new Error("Tu as déjà signalé cet article. Un administrateur l’examinera.");
    throw error;
  }
}

export async function listWikiReports(): Promise<WikiReport[]> {
  await ensureReportsSchema();
  const result = await loreDatabase().query(`SELECT r.id,r.article_id,r.reason,r.created_at,e.title AS article_title,u.username AS reporter_name
    FROM sio_wiki_reports r JOIN sio_lore_entries e ON e.id=r.article_id JOIN sio_users u ON u.id=r.reporter_id
    WHERE r.status='OPEN' ORDER BY r.created_at ASC LIMIT 200`);
  return result.rows.map((row) => ({ id: row.id, articleId: row.article_id, articleTitle: row.article_title, reason: row.reason, reporterName: row.reporter_name, createdAt: row.created_at.toISOString() }));
}

export async function resolveWikiReport(id: string): Promise<void> {
  await ensureReportsSchema();
  const result = await loreDatabase().query("UPDATE sio_wiki_reports SET status='RESOLVED',resolved_at=now() WHERE id=$1 AND status='OPEN' RETURNING id", [id]);
  if (!result.rowCount) throw new Error("Signalement introuvable.");
}
