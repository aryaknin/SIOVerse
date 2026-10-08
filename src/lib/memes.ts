import "server-only";

import { randomUUID } from "node:crypto";
import { ensureLoreSchema, loreDatabase } from "./lore-db";
import { ensurePeopleSchema, linkContentPeople, listContentPeople, type PersonOption } from "./people";

export type MemeEntry = { id: string; title: string; body: string; mediaType: string; concerned: PersonOption[]; people: string[]; createdAt: string; likeCount: number; commentCount: number; liked: boolean; favorite: boolean };
export type MemeComment = { id: string; body: string; authorName: string; isMine: boolean; createdAt: string };
export type MemeDetail = { comments: MemeComment[]; likeCount: number; commentCount: number; liked: boolean; favorite: boolean };

let schemaReady: Promise<void> | null = null;

export async function ensureMemesSchema() {
  await ensureLoreSchema();
  schemaReady ??= loreDatabase().query(`ALTER TABLE sio_lore_entries ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image/gif';
  CREATE TABLE IF NOT EXISTS sio_meme_people (
    meme_id uuid NOT NULL REFERENCES sio_lore_entries(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES sio_users(id) ON DELETE CASCADE,
    PRIMARY KEY(meme_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS sio_article_memes (
    article_id uuid NOT NULL REFERENCES sio_lore_entries(id) ON DELETE CASCADE,
    meme_id uuid NOT NULL REFERENCES sio_lore_entries(id) ON DELETE CASCADE,
    PRIMARY KEY(article_id,meme_id)
  );
  CREATE TABLE IF NOT EXISTS sio_meme_likes (
    meme_id uuid NOT NULL REFERENCES sio_lore_entries(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES sio_users(id) ON DELETE CASCADE,
    PRIMARY KEY(meme_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS sio_meme_favorites (
    meme_id uuid NOT NULL REFERENCES sio_lore_entries(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES sio_users(id) ON DELETE CASCADE,
    PRIMARY KEY(meme_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS sio_meme_comments (
    id uuid PRIMARY KEY,
    meme_id uuid NOT NULL REFERENCES sio_lore_entries(id) ON DELETE CASCADE,
    user_id uuid REFERENCES sio_users(id) ON DELETE SET NULL,
    author_name text NOT NULL,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS sio_meme_comments_meme_idx ON sio_meme_comments(meme_id,created_at,id);
  INSERT INTO sio_meme_people(meme_id,user_id)
  SELECT id,author_id FROM sio_lore_entries WHERE kind='GIF' AND author_id IS NOT NULL
  ON CONFLICT DO NOTHING;`).then(() => {}).catch((error) => { schemaReady = null; throw error; });
  await schemaReady;
  await ensurePeopleSchema();
}

export async function listMemes(userId?: string): Promise<MemeEntry[]> {
  await ensureMemesSchema();
  const [result, contentPeople] = await Promise.all([
    loreDatabase().query(`SELECT e.id,e.title,e.body,e.media_type,e.created_at,
      (SELECT count(*)::integer FROM sio_meme_likes l WHERE l.meme_id=e.id) AS like_count,
      (SELECT count(*)::integer FROM sio_meme_comments c WHERE c.meme_id=e.id) AS comment_count,
      EXISTS(SELECT 1 FROM sio_meme_likes l WHERE l.meme_id=e.id AND l.user_id=$1) AS liked,
      EXISTS(SELECT 1 FROM sio_meme_favorites f WHERE f.meme_id=e.id AND f.user_id=$1) AS favorite
      FROM sio_lore_entries e WHERE e.kind='GIF' ORDER BY favorite DESC,e.created_at DESC,e.id DESC`, [userId ?? null]),
    listContentPeople(),
  ]);
  return result.rows.map((row) => ({ id: row.id, title: row.title, body: row.body, mediaType: row.media_type, concerned: contentPeople[row.id] ?? [], people: (contentPeople[row.id] ?? []).map((person) => person.name), createdAt: row.created_at.toISOString(), likeCount: row.like_count, commentCount: row.comment_count, liked: row.liked, favorite: row.favorite }));
}

async function assertMeme(id: string): Promise<void> {
  const found = await loreDatabase().query("SELECT 1 FROM sio_lore_entries WHERE id=$1 AND kind='GIF'", [id]);
  if (!found.rowCount) throw new Error("Mème introuvable.");
}

export async function memeDetail(id: string, userId: string): Promise<MemeDetail> {
  await ensureMemesSchema();
  await assertMeme(id);
  const [stats, comments] = await Promise.all([
    loreDatabase().query(`SELECT
      (SELECT count(*)::integer FROM sio_meme_likes WHERE meme_id=$1) AS like_count,
      (SELECT count(*)::integer FROM sio_meme_comments WHERE meme_id=$1) AS comment_count,
      EXISTS(SELECT 1 FROM sio_meme_likes WHERE meme_id=$1 AND user_id=$2) AS liked,
      EXISTS(SELECT 1 FROM sio_meme_favorites WHERE meme_id=$1 AND user_id=$2) AS favorite`, [id, userId]),
    loreDatabase().query("SELECT id,body,author_name,user_id,created_at FROM sio_meme_comments WHERE meme_id=$1 ORDER BY created_at DESC,id DESC LIMIT 200", [id]),
  ]);
  return { comments: comments.rows.map((row) => ({ id: row.id, body: row.body, authorName: row.author_name, isMine: row.user_id === userId, createdAt: row.created_at.toISOString() })), likeCount: stats.rows[0].like_count, commentCount: stats.rows[0].comment_count, liked: stats.rows[0].liked, favorite: stats.rows[0].favorite };
}

export async function setMemeReaction(id: string, userId: string, kind: "like" | "favorite", active: boolean): Promise<void> {
  await ensureMemesSchema();
  await assertMeme(id);
  const table = kind === "like" ? "sio_meme_likes" : "sio_meme_favorites";
  if (active) await loreDatabase().query(`INSERT INTO ${table}(meme_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [id, userId]);
  else await loreDatabase().query(`DELETE FROM ${table} WHERE meme_id=$1 AND user_id=$2`, [id, userId]);
}

export async function addMemeComment(id: string, userId: string, authorName: string, body: string): Promise<void> {
  await ensureMemesSchema();
  await assertMeme(id);
  await loreDatabase().query("INSERT INTO sio_meme_comments(id,meme_id,user_id,author_name,body) VALUES($1,$2,$3,$4,$5)", [randomUUID(), id, userId, authorName, body]);
}

export async function deleteMemeComment(id: string, commentId: string, userId: string, isAdmin: boolean): Promise<void> {
  await ensureMemesSchema();
  const result = await loreDatabase().query("DELETE FROM sio_meme_comments WHERE id=$1 AND meme_id=$2 AND (user_id=$3 OR $4::boolean) RETURNING id", [commentId, id, userId, isAdmin]);
  if (!result.rowCount) throw new Error("Commentaire introuvable ou suppression non autorisée.");
}

export async function listArticleMemeLinks(): Promise<Record<string, string[]>> {
  await ensureMemesSchema();
  const result = await loreDatabase().query("SELECT article_id,meme_id FROM sio_article_memes ORDER BY article_id,meme_id");
  const links: Record<string, string[]> = {};
  for (const row of result.rows) (links[row.article_id] ??= []).push(row.meme_id);
  return links;
}

export async function createMeme(input: { title: string; body: string; media: Buffer; mediaType: string; personKeys: string[] }): Promise<void> {
  await ensureMemesSchema();
  const client = await loreDatabase().connect();
  try {
    await client.query("BEGIN");
    const id = randomUUID();
    const firstStudent = input.personKeys.find((key) => key.startsWith("user:"));
    await client.query("INSERT INTO sio_lore_entries(id,kind,title,body,gif_data,author_id,media_type) VALUES($1,'GIF',$2,$3,$4,$5,$6)", [id, input.title, input.body, input.media, firstStudent?.slice(5) ?? null, input.mediaType]);
    await linkContentPeople(client, id, input.personKeys);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function memeMedia(id: string): Promise<{ content: Buffer; mimeType: string } | null> {
  await ensureMemesSchema();
  const result = await loreDatabase().query("SELECT gif_data,media_type FROM sio_lore_entries WHERE id=$1 AND kind='GIF'", [id]);
  const row = result.rows[0];
  return row?.gif_data ? { content: row.gif_data, mimeType: row.media_type } : null;
}
