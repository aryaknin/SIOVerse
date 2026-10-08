import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ensurePeopleSchema, linkContentPeople } from "./people";
import { ensureLoreSchema, loreDatabase } from "./lore-db";
import { ensureMemesSchema } from "./memes";
import type { WikiCategoryId } from "./wiki-categories";

export type LoreSection = { id: string; title: string; body: string; position: number; updatedAt: string; editorName: string | null };
export type LoreRevision = { id: string; action: string; detail: string; editorName: string | null; createdAt: string; canRestore: boolean };
export type LoreEntry = { id: string; kind: "ARTICLE"; title: string; body: string; category: WikiCategoryId; authorId: string | null; authorName: string | null; createdAt: string; updatedAt: string; sections: LoreSection[]; revisions: LoreRevision[] };

let wikiSchemaReady: Promise<void> | null = null;

export async function ensureWikiSchema() {
  wikiSchemaReady ??= (async () => {
    await ensureLoreSchema();
    await loreDatabase().query(`ALTER TABLE sio_lore_entries ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
      ALTER TABLE sio_lore_entries ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'OTHER';
      CREATE UNIQUE INDEX IF NOT EXISTS sio_lore_article_title_unique_idx ON sio_lore_entries(lower(title)) WHERE kind='ARTICLE';
      CREATE TABLE IF NOT EXISTS sio_lore_sections (
        id uuid PRIMARY KEY,
        article_id uuid NOT NULL REFERENCES sio_lore_entries(id) ON DELETE CASCADE,
        title text NOT NULL,
        body text NOT NULL DEFAULT '',
        position integer NOT NULL,
        updated_by uuid REFERENCES sio_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS sio_lore_sections_article_idx ON sio_lore_sections(article_id,position);
      CREATE TABLE IF NOT EXISTS sio_lore_revisions (
        id uuid PRIMARY KEY,
        article_id uuid NOT NULL REFERENCES sio_lore_entries(id) ON DELETE CASCADE,
        editor_id uuid REFERENCES sio_users(id) ON DELETE SET NULL,
        action text NOT NULL,
        detail text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS sio_lore_revisions_article_idx ON sio_lore_revisions(article_id,created_at DESC);`);
    await loreDatabase().query("ALTER TABLE sio_lore_revisions ADD COLUMN IF NOT EXISTS snapshot jsonb");
  })().catch((error) => { wikiSchemaReady = null; throw error; });
  await wikiSchemaReady;
}

export async function listLoreEntries(): Promise<LoreEntry[]> {
  await ensureWikiSchema();
  const [rows, sections, revisions] = await Promise.all([
    loreDatabase().query("SELECT e.id,e.kind,e.title,e.body,e.category,e.author_id,u.username AS author_name,e.created_at,e.updated_at FROM sio_lore_entries e LEFT JOIN sio_users u ON u.id=e.author_id WHERE e.kind='ARTICLE' ORDER BY e.updated_at DESC,e.id DESC"),
    loreDatabase().query("SELECT s.id,s.article_id,s.title,s.body,s.position,s.updated_at,u.username AS editor_name FROM sio_lore_sections s LEFT JOIN sio_users u ON u.id=s.updated_by ORDER BY s.article_id,s.position,s.created_at"),
    loreDatabase().query("SELECT r.id,r.article_id,r.action,r.detail,r.created_at,r.snapshot IS NOT NULL AS can_restore,u.username AS editor_name FROM (SELECT *,row_number() OVER (PARTITION BY article_id ORDER BY created_at DESC,id DESC) AS rank FROM sio_lore_revisions) r LEFT JOIN sio_users u ON u.id=r.editor_id WHERE r.rank<=50 ORDER BY r.article_id,r.created_at DESC"),
  ]);
  const byArticle = new Map<string, LoreEntry>();
  for (const row of rows.rows) byArticle.set(row.id, { id: row.id, kind: row.kind, title: row.title, body: row.body, category: row.category as WikiCategoryId, authorId: row.author_id, authorName: row.author_name, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), sections: [], revisions: [] });
  for (const row of sections.rows) byArticle.get(row.article_id)?.sections.push({ id: row.id, title: row.title, body: row.body, position: row.position, updatedAt: row.updated_at.toISOString(), editorName: row.editor_name });
  for (const row of revisions.rows) byArticle.get(row.article_id)?.revisions.push({ id: row.id, action: row.action, detail: row.detail, editorName: row.editor_name, createdAt: row.created_at.toISOString(), canRestore: row.can_restore });
  return [...byArticle.values()];
}

export async function createLoreEntry(input: { title: string; body: string; category: WikiCategoryId; authorId: string; memeIds: string[]; personKeys: string[] }): Promise<void> {
  await ensureWikiSchema();
  await ensurePeopleSchema();
  const client = await loreDatabase().connect();
  try {
    await client.query("BEGIN");
    const id = randomUUID();
    const result = await client.query("INSERT INTO sio_lore_entries(id,kind,title,body,author_id,category) SELECT $1,'ARTICLE',$2,$3,id,$5 FROM sio_users WHERE id=$4 RETURNING id", [id, input.title, input.body, input.authorId, input.category]);
    if (!result.rowCount) throw new Error("Membre de la classe introuvable.");
    await client.query("INSERT INTO sio_lore_revisions(id,article_id,editor_id,action,detail) VALUES($1,$2,$3,'CREATE',$4)", [randomUUID(), id, input.authorId, "Article créé"]);
    await linkContentPeople(client, id, input.personKeys);
    if (input.memeIds.length) {
      const valid = await client.query("SELECT count(*)::integer AS total FROM sio_lore_entries WHERE kind='GIF' AND id=ANY($1::uuid[])", [input.memeIds]);
      if (Number(valid.rows[0].total) !== input.memeIds.length) throw new Error("Un GIF sélectionné est introuvable.");
      for (const memeId of input.memeIds) await client.query("INSERT INTO sio_article_memes(article_id,meme_id) VALUES($1,$2)", [id, memeId]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); if ((error as { code?: string }).code === "23505") throw new Error("Un article porte déjà ce titre."); throw error; }
  finally { client.release(); }
}

type WikiEdit =
  | { action: "article"; articleId: string; title: string; body: string; category: WikiCategoryId; expectedUpdatedAt: string; editorId: string }
  | { action: "section-add"; articleId: string; title: string; body: string; editorId: string }
  | { action: "section-edit"; articleId: string; sectionId: string; title: string; body: string; expectedUpdatedAt: string; editorId: string }
  | { action: "section-delete"; articleId: string; sectionId: string; expectedUpdatedAt: string; editorId: string }
  | { action: "section-order"; articleId: string; sectionIds: string[]; expectedUpdatedAt: string; editorId: string }
  | { action: "media"; articleId: string; memeIds: string[]; editorId: string };

type WikiSnapshot = { title: string; body: string; category: string; sections: { id: string; title: string; body: string; position: number }[]; memeIds: string[] };

async function snapshotArticle(client: PoolClient, articleId: string): Promise<WikiSnapshot> {
  const [article, sections, memes] = await Promise.all([
    client.query("SELECT title,body,category FROM sio_lore_entries WHERE id=$1 AND kind='ARTICLE'", [articleId]),
    client.query("SELECT id,title,body,position FROM sio_lore_sections WHERE article_id=$1 ORDER BY position", [articleId]),
    client.query("SELECT meme_id FROM sio_article_memes WHERE article_id=$1 ORDER BY meme_id", [articleId]),
  ]);
  if (!article.rows[0]) throw new Error("Article introuvable.");
  return { title: article.rows[0].title, body: article.rows[0].body, category: article.rows[0].category, sections: sections.rows, memeIds: memes.rows.map((row) => row.meme_id) };
}

export async function editWiki(input: WikiEdit): Promise<void> {
  await ensureWikiSchema();
  await ensureMemesSchema();
  const client = await loreDatabase().connect();
  try {
    await client.query("BEGIN");
    const article = await client.query("SELECT id,updated_at FROM sio_lore_entries WHERE id=$1 AND kind='ARTICLE' FOR UPDATE", [input.articleId]);
    if (!article.rowCount) throw new Error("Article introuvable.");
    if ((input.action === "article" || input.action === "section-order") && article.rows[0].updated_at.toISOString() !== input.expectedUpdatedAt) throw new Error("Cette page a changé depuis son ouverture. Recharge-la avant de publier ta modification.");
    const before = await snapshotArticle(client, input.articleId);
    let detail = "";
    if (input.action === "article") {
      await client.query("UPDATE sio_lore_entries SET title=$2,body=$3,category=$4 WHERE id=$1", [input.articleId, input.title, input.body, input.category]);
      detail = "Titre, introduction ou catégorie modifiés";
    } else if (input.action === "section-add") {
      const result = await client.query("SELECT count(*)::integer AS total,COALESCE(MAX(position),-1)+1 AS next_position FROM sio_lore_sections WHERE article_id=$1", [input.articleId]);
      if (result.rows[0].total >= 50) throw new Error("Cet article a atteint la limite de 50 sections.");
      await client.query("INSERT INTO sio_lore_sections(id,article_id,title,body,position,updated_by) VALUES($1,$2,$3,$4,$5,$6)", [randomUUID(), input.articleId, input.title, input.body, result.rows[0].next_position, input.editorId]);
      detail = `Section « ${input.title} » ajoutée`;
    } else if (input.action === "section-edit") {
      const previous = await client.query("SELECT updated_at FROM sio_lore_sections WHERE id=$1 AND article_id=$2", [input.sectionId, input.articleId]);
      if (!previous.rowCount) throw new Error("Section introuvable.");
      if (previous.rows[0].updated_at.toISOString() !== input.expectedUpdatedAt) throw new Error("Cette section a changé depuis son ouverture. Recharge-la avant de publier.");
      await client.query("UPDATE sio_lore_sections SET title=$3,body=$4,updated_by=$5,updated_at=now() WHERE id=$1 AND article_id=$2", [input.sectionId, input.articleId, input.title, input.body, input.editorId]);
      detail = `Section « ${input.title} » modifiée`;
    } else if (input.action === "section-delete") {
      const previous = await client.query("SELECT title,updated_at FROM sio_lore_sections WHERE id=$1 AND article_id=$2", [input.sectionId, input.articleId]);
      if (!previous.rowCount) throw new Error("Section introuvable.");
      if (previous.rows[0].updated_at.toISOString() !== input.expectedUpdatedAt) throw new Error("Cette section a changé depuis son ouverture. Recharge-la avant de la supprimer.");
      await client.query("DELETE FROM sio_lore_sections WHERE id=$1 AND article_id=$2", [input.sectionId, input.articleId]);
      detail = `Section « ${previous.rows[0].title} » supprimée`;
    } else if (input.action === "section-order") {
      const current = await client.query("SELECT id FROM sio_lore_sections WHERE article_id=$1 ORDER BY position", [input.articleId]);
      if (current.rows.length !== input.sectionIds.length || new Set(input.sectionIds).size !== current.rows.length || current.rows.some((row) => !input.sectionIds.includes(row.id))) throw new Error("Ordre des sections invalide.");
      for (const [position, id] of input.sectionIds.entries()) await client.query("UPDATE sio_lore_sections SET position=$3 WHERE id=$1 AND article_id=$2", [id, input.articleId, position]);
      detail = "Sections réorganisées";
    } else {
      if (new Set(input.memeIds).size !== input.memeIds.length) throw new Error("Un même mème est sélectionné plusieurs fois.");
      const valid = await client.query("SELECT count(*)::integer AS total FROM sio_lore_entries WHERE kind='GIF' AND id=ANY($1::uuid[])", [input.memeIds]);
      if (valid.rows[0].total !== input.memeIds.length) throw new Error("Un mème sélectionné est introuvable.");
      await client.query("DELETE FROM sio_article_memes WHERE article_id=$1", [input.articleId]);
      for (const memeId of input.memeIds) await client.query("INSERT INTO sio_article_memes(article_id,meme_id) VALUES($1,$2)", [input.articleId, memeId]);
      detail = "Illustrations de l’article modifiées";
    }
    await client.query("UPDATE sio_lore_entries SET updated_at=now() WHERE id=$1", [input.articleId]);
    await client.query("INSERT INTO sio_lore_revisions(id,article_id,editor_id,action,detail,snapshot) VALUES($1,$2,$3,$4,$5,$6::jsonb)", [randomUUID(), input.articleId, input.editorId, input.action, detail, JSON.stringify(before)]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); if ((error as { code?: string }).code === "23505") throw new Error("Un article porte déjà ce titre."); throw error; }
  finally { client.release(); }
}

export async function restoreWikiRevision(articleId: string, revisionId: string, editorId: string): Promise<void> {
  await ensureWikiSchema(); await ensureMemesSchema();
  const client = await loreDatabase().connect();
  try {
    await client.query("BEGIN");
    const article = await client.query("SELECT id FROM sio_lore_entries WHERE id=$1 AND kind='ARTICLE' FOR UPDATE", [articleId]);
    if (!article.rowCount) throw new Error("Article introuvable.");
    const revision = await client.query("SELECT snapshot FROM sio_lore_revisions WHERE id=$1 AND article_id=$2", [revisionId, articleId]);
    const target = revision.rows[0]?.snapshot as WikiSnapshot | undefined;
    if (!target || !Array.isArray(target.sections) || !Array.isArray(target.memeIds)) throw new Error("Cette ancienne modification n’a pas de sauvegarde restaurable.");
    const before = await snapshotArticle(client, articleId);
    await client.query("UPDATE sio_lore_entries SET title=$2,body=$3,category=$4,updated_at=now() WHERE id=$1", [articleId, target.title, target.body, target.category]);
    await client.query("DELETE FROM sio_lore_sections WHERE article_id=$1", [articleId]);
    for (const section of target.sections) await client.query("INSERT INTO sio_lore_sections(id,article_id,title,body,position,updated_by) VALUES($1,$2,$3,$4,$5,$6)", [section.id, articleId, section.title, section.body, section.position, editorId]);
    await client.query("DELETE FROM sio_article_memes WHERE article_id=$1", [articleId]);
    for (const memeId of target.memeIds) await client.query("INSERT INTO sio_article_memes(article_id,meme_id) SELECT $1,id FROM sio_lore_entries WHERE id=$2 AND kind='GIF'", [articleId, memeId]);
    await client.query("INSERT INTO sio_lore_revisions(id,article_id,editor_id,action,detail,snapshot) VALUES($1,$2,$3,'RESTORE',$4,$5::jsonb)", [randomUUID(), articleId, editorId, "Version antérieure restaurée", JSON.stringify(before)]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); if ((error as { code?: string }).code === "23505") throw new Error("Un article porte déjà ce titre."); throw error; }
  finally { client.release(); }
}

export async function loreGif(id: string): Promise<Buffer | null> {
  await ensureLoreSchema();
  const result = await loreDatabase().query("SELECT gif_data FROM sio_lore_entries WHERE id=$1 AND kind='GIF'", [id]);
  return result.rows[0]?.gif_data ?? null;
}
