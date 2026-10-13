import "server-only";

import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export type CustomWallpaper = { id: string; name: string; file: string; mood: string; mediaType: string };

const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000, max: 3 }) : null;
pool?.on("error", () => {});
let schemaReady: Promise<void> | null = null;

function db() {
  if (!pool) throw new Error("PostgreSQL n’est pas disponible.");
  return pool;
}

async function ensureSchema() {
  schemaReady ??= db().query(`CREATE TABLE IF NOT EXISTS sio_wallpapers (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES sio_users(id) ON DELETE CASCADE,
    name text NOT NULL,
    gif_data bytea NOT NULL,
    media_type text NOT NULL DEFAULT 'image/gif',
    created_at timestamptz NOT NULL DEFAULT now()
  ); ALTER TABLE sio_wallpapers ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image/gif';
  CREATE INDEX IF NOT EXISTS sio_wallpapers_user_idx ON sio_wallpapers(user_id,created_at);`).then(() => {}).catch((error) => { schemaReady = null; throw error; });
  await schemaReady;
}

export async function listCustomWallpapers(userId: string): Promise<CustomWallpaper[]> {
  await ensureSchema();
  const result = await db().query("SELECT id,name,media_type FROM sio_wallpapers WHERE user_id=$1 ORDER BY created_at,id", [userId]);
  return result.rows.map((row) => ({ id: row.id, name: row.name, mediaType: row.media_type, mood: row.media_type === "image/gif" ? "GIF personnel" : "Image personnelle", file: `/api/wallpapers/${row.id}` }));
}

export async function addCustomWallpaper(userId: string, name: string, content: Buffer, mediaType: string): Promise<CustomWallpaper> {
  await ensureSchema();
  const count = await db().query("SELECT count(*)::integer AS total FROM sio_wallpapers WHERE user_id=$1", [userId]);
  if (Number(count.rows[0].total) >= 12) throw new Error("Tu peux conserver jusqu’à 12 fonds d’écran personnels.");
  const id = randomUUID();
  await db().query("INSERT INTO sio_wallpapers(id,user_id,name,gif_data,media_type) VALUES($1,$2,$3,$4,$5)", [id, userId, name, content, mediaType]);
  return { id, name, mediaType, mood: mediaType === "image/gif" ? "GIF personnel" : "Image personnelle", file: `/api/wallpapers/${id}` };
}

export async function getCustomWallpaper(userId: string, id: string): Promise<{ content: Buffer; mediaType: string } | null> {
  await ensureSchema();
  const result = await db().query("SELECT gif_data,media_type FROM sio_wallpapers WHERE user_id=$1 AND id=$2", [userId, id]);
  const row = result.rows[0];
  return row?.gif_data ? { content: row.gif_data, mediaType: row.media_type } : null;
}

export async function deleteCustomWallpaper(userId: string, id: string): Promise<boolean> {
  await ensureSchema();
  const result = await db().query("DELETE FROM sio_wallpapers WHERE user_id=$1 AND id=$2", [userId, id]);
  return Boolean(result.rowCount);
}
