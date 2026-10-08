import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ensureLoreSchema, loreDatabase } from "./lore-db";

export type PersonKind = "STUDENT" | "TEACHER" | "OTHER";
export type PersonOption = { key: string; name: string; subtitle: string; kind: PersonKind };

const teachers = ["M. Buffeteau", "Mme Benyattou", "M. Ronceux", "M. Pechberty", "M. Hagege", "Mme Attal", "M. Soudry"];
let schemaReady: Promise<void> | null = null;

export async function ensurePeopleSchema() {
  schemaReady ??= (async () => {
    await ensureLoreSchema();
    const client = await loreDatabase().connect();
    try {
      await client.query("BEGIN");
      await client.query(`CREATE TABLE IF NOT EXISTS sio_named_people (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('TEACHER','OTHER')),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS sio_named_people_name_idx ON sio_named_people(lower(name));
      CREATE TABLE IF NOT EXISTS sio_meme_people (
        meme_id uuid NOT NULL REFERENCES sio_lore_entries(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES sio_users(id) ON DELETE CASCADE,
        PRIMARY KEY(meme_id,user_id)
      );
      CREATE TABLE IF NOT EXISTS sio_content_people (
        id uuid PRIMARY KEY,
        content_id uuid NOT NULL REFERENCES sio_lore_entries(id) ON DELETE CASCADE,
        user_id uuid REFERENCES sio_users(id) ON DELETE SET NULL,
        named_person_id uuid REFERENCES sio_named_people(id) ON DELETE SET NULL,
        display_name text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('STUDENT','TEACHER','OTHER'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS sio_content_people_user_idx ON sio_content_people(content_id,user_id) WHERE user_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS sio_content_people_named_idx ON sio_content_people(content_id,named_person_id) WHERE named_person_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS sio_person_profiles (
        person_key text PRIMARY KEY,
        headline text NOT NULL DEFAULT '',
        bio text NOT NULL DEFAULT '',
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sio_people_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );`);
      for (const name of teachers) await client.query("INSERT INTO sio_named_people(id,name,kind) VALUES($1,$2,'TEACHER') ON CONFLICT DO NOTHING", [randomUUID(), name]);
      const migration = await client.query("INSERT INTO sio_people_migrations(name) VALUES('legacy-concerned-people-v1') ON CONFLICT DO NOTHING RETURNING name");
      if (migration.rowCount) {
        const legacy = await client.query("SELECT to_regclass('sio_meme_people') IS NOT NULL AS exists");
        if (legacy.rows[0].exists) {
          const rows = await client.query("SELECT p.meme_id,p.user_id,u.username FROM sio_meme_people p JOIN sio_users u ON u.id=p.user_id");
          for (const row of rows.rows) await client.query("INSERT INTO sio_content_people(id,content_id,user_id,display_name,kind) VALUES($1,$2,$3,$4,'STUDENT') ON CONFLICT DO NOTHING", [randomUUID(), row.meme_id, row.user_id, row.username]);
        }
        const older = await client.query("SELECT e.id,e.author_id,u.username FROM sio_lore_entries e JOIN sio_users u ON u.id=e.author_id WHERE e.kind='GIF'");
        for (const row of older.rows) await client.query("INSERT INTO sio_content_people(id,content_id,user_id,display_name,kind) VALUES($1,$2,$3,$4,'STUDENT') ON CONFLICT DO NOTHING", [randomUUID(), row.id, row.author_id, row.username]);
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  })().catch((error) => { schemaReady = null; throw error; });
  await schemaReady;
}

export async function listPeopleOptions(): Promise<PersonOption[]> {
  await ensurePeopleSchema();
  const [users, named] = await Promise.all([
    loreDatabase().query("SELECT id,username FROM sio_users ORDER BY username"),
    loreDatabase().query("SELECT id,name,kind FROM sio_named_people ORDER BY kind DESC,name"),
  ]);
  return [
    ...users.rows.map((row) => ({ key: `user:${row.id}`, name: row.username, subtitle: "Élève de la classe", kind: "STUDENT" as const })),
    ...named.rows.map((row) => ({ key: `person:${row.id}`, name: row.name, subtitle: row.kind === "TEACHER" ? "Professeur" : "Autre personne", kind: row.kind as "TEACHER" | "OTHER" })),
  ];
}

export async function addNamedPerson(name: string, kind: "TEACHER" | "OTHER"): Promise<PersonOption> {
  await ensurePeopleSchema();
  try {
    const id = randomUUID();
    await loreDatabase().query("INSERT INTO sio_named_people(id,name,kind) VALUES($1,$2,$3)", [id, name, kind]);
    return { key: `person:${id}`, name, kind, subtitle: kind === "TEACHER" ? "Professeur" : "Autre personne" };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new Error("Cette personne existe déjà dans la liste.");
    throw error;
  }
}

export async function linkContentPeople(client: PoolClient, contentId: string, keys: string[]): Promise<void> {
  if (!keys.length) throw new Error("Sélectionne au moins une personne concernée.");
  if (new Set(keys).size !== keys.length) throw new Error("Une personne est sélectionnée plusieurs fois.");
  for (const key of keys) {
    const match = /^(user|person):([0-9a-f-]{36})$/i.exec(key);
    if (!match) throw new Error("Personne sélectionnée invalide.");
    const [, type, id] = match;
    if (type === "user") {
      const user = await client.query("SELECT username FROM sio_users WHERE id=$1", [id]);
      if (!user.rows[0]) throw new Error("Un membre sélectionné n’est plus inscrit.");
      await client.query("INSERT INTO sio_content_people(id,content_id,user_id,display_name,kind) VALUES($1,$2,$3,$4,'STUDENT')", [randomUUID(), contentId, id, user.rows[0].username]);
    } else {
      const person = await client.query("SELECT name,kind FROM sio_named_people WHERE id=$1", [id]);
      if (!person.rows[0]) throw new Error("Une personne sélectionnée est introuvable.");
      await client.query("INSERT INTO sio_content_people(id,content_id,named_person_id,display_name,kind) VALUES($1,$2,$3,$4,$5)", [randomUUID(), contentId, id, person.rows[0].name, person.rows[0].kind]);
    }
  }
}

export async function listContentPeople(): Promise<Record<string, PersonOption[]>> {
  await ensurePeopleSchema();
  const result = await loreDatabase().query(`SELECT c.id,c.content_id,c.user_id,c.named_person_id,c.display_name,c.kind,
    u.username,p.name AS named_name
    FROM sio_content_people c LEFT JOIN sio_users u ON u.id=c.user_id
    LEFT JOIN sio_named_people p ON p.id=c.named_person_id
    ORDER BY c.content_id,c.kind,c.display_name`);
  const contentPeople: Record<string, PersonOption[]> = {};
  for (const row of result.rows) {
    const kind = row.kind as PersonKind;
    (contentPeople[row.content_id] ??= []).push({
      key: row.user_id ? `user:${row.user_id}` : row.named_person_id ? `person:${row.named_person_id}` : `former:${row.id}`,
      name: row.username ?? row.named_name ?? row.display_name,
      subtitle: row.user_id ? "Élève de la classe" : kind === "TEACHER" ? "Professeur" : kind === "OTHER" ? "Autre personne" : "Ancien membre",
      kind,
    });
  }
  return contentPeople;
}

export async function replaceContentPeople(contentId: string, keys: string[]): Promise<void> {
  await ensurePeopleSchema();
  const client = await loreDatabase().connect();
  try {
    await client.query("BEGIN");
    const content = await client.query("SELECT id FROM sio_lore_entries WHERE id=$1 FOR UPDATE", [contentId]);
    if (!content.rows[0]) throw new Error("Contenu introuvable.");
    await client.query("DELETE FROM sio_content_people WHERE content_id=$1", [contentId]);
    await linkContentPeople(client, contentId, keys);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export type PersonProfile = {
  person: PersonOption;
  headline: string;
  bio: string;
  articles: { id: string; title: string; body: string }[];
  memes: { id: string; title: string }[];
};

export async function getPersonProfile(key: string): Promise<PersonProfile | null> {
  if (!/^(user|person):[0-9a-f-]{36}$/i.test(key)) return null;
  await ensurePeopleSchema();
  const people = await listPeopleOptions();
  const person = people.find((item) => item.key === key);
  if (!person) return null;
  const [profile, content] = await Promise.all([
    loreDatabase().query("SELECT headline,bio FROM sio_person_profiles WHERE person_key=$1", [key]),
    loreDatabase().query(`SELECT DISTINCT e.id,e.kind,e.title,e.body,e.created_at
      FROM sio_content_people c JOIN sio_lore_entries e ON e.id=c.content_id
      WHERE ${key.startsWith("user:") ? "c.user_id" : "c.named_person_id"}=$1
      ORDER BY e.created_at DESC`, [key.slice(key.indexOf(":") + 1)]),
  ]);
  return {
    person,
    headline: profile.rows[0]?.headline ?? "",
    bio: profile.rows[0]?.bio ?? "",
    articles: content.rows.filter((row) => row.kind === "ARTICLE").map((row) => ({ id: row.id, title: row.title, body: row.body })),
    memes: content.rows.filter((row) => row.kind === "GIF").map((row) => ({ id: row.id, title: row.title })),
  };
}

export async function updatePersonProfile(key: string, headline: string, bio: string): Promise<void> {
  if (!await getPersonProfile(key)) throw new Error("Profil introuvable.");
  await loreDatabase().query(`INSERT INTO sio_person_profiles(person_key,headline,bio) VALUES($1,$2,$3)
    ON CONFLICT(person_key) DO UPDATE SET headline=excluded.headline,bio=excluded.bio,updated_at=now()`, [key, headline, bio]);
}
