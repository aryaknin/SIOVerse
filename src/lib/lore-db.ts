import "server-only";

import { Pool } from "pg";

const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000, max: 5 }) : null;
pool?.on("error", () => {});
let schemaReady: Promise<void> | null = null;

export function loreDatabase(): Pool {
  if (!pool) throw new Error("PostgreSQL n’est pas disponible.");
  return pool;
}

export async function ensureLoreSchema() {
  schemaReady ??= loreDatabase().query(`CREATE TABLE IF NOT EXISTS sio_lore_entries (
    id uuid PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('ARTICLE','GIF')),
    title text NOT NULL,
    body text NOT NULL DEFAULT '',
    gif_data bytea,
    author_id uuid REFERENCES sio_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  ); CREATE INDEX IF NOT EXISTS sio_lore_entries_created_idx ON sio_lore_entries(created_at DESC);`).then(() => {}).catch((error) => { schemaReady = null; throw error; });
  await schemaReady;
}
