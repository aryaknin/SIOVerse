import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Pool, type PoolClient } from "pg";
import { hashPassword, verifyPassword } from "./auth-crypto";

export type UserRole = "ADMIN" | "MEMBER";
export type SessionUser = { id: string; username: string; email: string; role: UserRole };
export type ListedUser = SessionUser & { createdAt: string };
export type NewUser = { username: string; email: string; password: string };

const cookieName = "sioverse_session";
const sessionSeconds = 14 * 24 * 60 * 60;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000, max: 5 }) : null;
pool?.on("error", () => {});
let schemaReady: Promise<void> | null = null;

function database() {
  if (!pool) throw new Error("PostgreSQL n’est pas configuré. Vérifie DATABASE_URL.");
  return pool;
}

async function ensureSchema() {
  schemaReady ??= (async () => {
    const client = await database().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS sio_users (
          id uuid PRIMARY KEY,
          username text NOT NULL UNIQUE,
          email text NOT NULL UNIQUE,
          password_hash text NOT NULL,
          role text NOT NULL CHECK (role IN ('ADMIN', 'MEMBER')),
          failed_attempts integer NOT NULL DEFAULT 0,
          locked_until timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS sio_sessions (
          token_hash text PRIMARY KEY,
          user_id uuid NOT NULL REFERENCES sio_users(id) ON DELETE CASCADE,
          expires_at timestamptz NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sio_sessions_user_idx ON sio_sessions(user_id);
        CREATE INDEX IF NOT EXISTS sio_sessions_expires_idx ON sio_sessions(expires_at);
        CREATE TABLE IF NOT EXISTS sio_invites (
          token_hash text PRIMARY KEY,
          email text NOT NULL,
          created_by uuid REFERENCES sio_users(id) ON DELETE SET NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL,
          used_at timestamptz
        );
        CREATE INDEX IF NOT EXISTS sio_invites_email_idx ON sio_invites(email);
      `);
    } finally { client.release(); }
  })().catch((error) => { schemaReady = null; throw error; });
  await schemaReady;
}

function publicUser(row: Record<string, unknown>): SessionUser {
  return { id: String(row.id), username: String(row.username), email: String(row.email), role: row.role as UserRole };
}

function tokenHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }

export async function countUsers(): Promise<number> {
  await ensureSchema();
  const result = await database().query("SELECT count(*)::integer AS total FROM sio_users");
  return result.rows[0].total as number;
}

async function insertUser(client: PoolClient, input: NewUser, role: UserRole): Promise<SessionUser> {
  const result = await client.query(
    "INSERT INTO sio_users(id,username,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,username,email,role",
    [randomUUID(), input.username.trim().toLocaleLowerCase("fr"), input.email.trim().toLocaleLowerCase("fr"), await hashPassword(input.password), role],
  );
  return publicUser(result.rows[0]);
}

export async function registerUser(input: NewUser, allowBootstrapAdmin: boolean, inviteCode?: string): Promise<SessionUser> {
  await ensureSchema();
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE sio_users IN EXCLUSIVE MODE");
    const count = Number((await client.query("SELECT count(*) AS total FROM sio_users")).rows[0].total);
    // First-account admin is only enabled on the loopback development server.
    const bootstrap = count === 0 && allowBootstrapAdmin;
    if (!bootstrap) {
      if (!inviteCode || !/^[A-Za-z0-9_-]{22}$/.test(inviteCode)) throw new Error("Une invitation de classe est nécessaire pour créer un compte.");
      const invite = await client.query(`UPDATE sio_invites SET used_at=now() WHERE token_hash=$1 AND email=$2 AND used_at IS NULL AND expires_at>now() RETURNING token_hash`, [tokenHash(inviteCode), input.email.trim().toLowerCase()]);
      if (!invite.rowCount) throw new Error("Invitation invalide, expirée ou attribuée à une autre adresse.");
    }
    const role: UserRole = bootstrap ? "ADMIN" : "MEMBER";
    const user = await insertUser(client, input, role);
    await client.query("COMMIT");
    return user;
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") throw new Error("Cet identifiant ou cet e-mail est déjà utilisé.");
    throw error;
  } finally { client.release(); }
}

export type ListedInvite = { email: string; createdAt: string; expiresAt: string };

export async function createInvite(email: string, actorId: string): Promise<{ code: string; expiresAt: string }> {
  await ensureSchema();
  const code = randomBytes(16).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  await database().query("INSERT INTO sio_invites(token_hash,email,created_by,expires_at) VALUES($1,$2,$3,$4)", [tokenHash(code), email.toLowerCase(), actorId, expiresAt]);
  return { code, expiresAt: expiresAt.toISOString() };
}

export async function listInvites(): Promise<ListedInvite[]> {
  await ensureSchema();
  const result = await database().query("SELECT email,created_at,expires_at FROM sio_invites WHERE used_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 100");
  return result.rows.map((row) => ({ email: row.email, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString() }));
}

export async function createUserByAdmin(input: NewUser & { role: UserRole }): Promise<SessionUser> {
  await ensureSchema();
  try {
    const client = await database().connect();
    try { return await insertUser(client, input, input.role); }
    finally { client.release(); }
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new Error("Cet identifiant ou cet e-mail est déjà utilisé.");
    throw error;
  }
}

export async function authenticateUser(identifier: string, password: string): Promise<SessionUser | null> {
  await ensureSchema();
  const key = identifier.trim().toLocaleLowerCase("fr");
  const result = await database().query("SELECT id,username,email,role,password_hash,failed_attempts,locked_until FROM sio_users WHERE username=$1 OR email=$1 LIMIT 1", [key]);
  const row = result.rows[0] as (Record<string, unknown> & { password_hash: string; failed_attempts: number; locked_until: Date | null }) | undefined;
  if (!row) { await hashPassword(password); return null; }
  if (row.locked_until && row.locked_until.getTime() > Date.now()) throw new Error("Trop de tentatives. Réessaie dans quelques minutes.");
  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) {
    const attempts = row.failed_attempts + 1;
    await database().query("UPDATE sio_users SET failed_attempts=$2,locked_until=$3 WHERE id=$1", [row.id, attempts, attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null]);
    return null;
  }
  await database().query("UPDATE sio_users SET failed_attempts=0,locked_until=NULL WHERE id=$1", [row.id]);
  return publicUser(row);
}

export async function createSession(userId: string): Promise<void> {
  await ensureSchema();
  const token = randomBytes(32).toString("base64url");
  await database().query("DELETE FROM sio_sessions WHERE expires_at<=now()");
  await database().query("INSERT INTO sio_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)", [tokenHash(token), userId, new Date(Date.now() + sessionSeconds * 1000)]);
  (await cookies()).set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: sessionSeconds });
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  await ensureSchema();
  const result = await database().query("SELECT u.id,u.username,u.email,u.role FROM sio_sessions s JOIN sio_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()", [tokenHash(token)]);
  return result.rows[0] ? publicUser(result.rows[0]) : null;
}

export async function requireUser(): Promise<SessionUser> {
  let user: SessionUser | null;
  try { user = await getCurrentUser(); }
  catch { redirect("/connexion"); }
  if (!user) redirect("/connexion");
  return user;
}

export async function revokeCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (token) { await ensureSchema(); await database().query("DELETE FROM sio_sessions WHERE token_hash=$1", [tokenHash(token)]); }
  cookieStore.delete(cookieName);
}

export async function listUsers(): Promise<ListedUser[]> {
  await ensureSchema();
  const result = await database().query("SELECT id,username,email,role,created_at FROM sio_users ORDER BY created_at,id");
  return result.rows.map((row) => ({ ...publicUser(row), createdAt: row.created_at.toISOString() }));
}

export async function changeUserRole(id: string, role: UserRole, actorId: string): Promise<void> {
  await ensureSchema();
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE sio_users IN EXCLUSIVE MODE");
    const target = (await client.query("SELECT role FROM sio_users WHERE id=$1", [id])).rows[0];
    if (!target) throw new Error("Compte introuvable.");
    if (id === actorId && role !== "ADMIN") throw new Error("Tu ne peux pas retirer tes propres droits administrateur.");
    if (target.role === "ADMIN" && role !== "ADMIN" && Number((await client.query("SELECT count(*) AS total FROM sio_users WHERE role='ADMIN'")).rows[0].total) <= 1) throw new Error("Il faut conserver au moins un administrateur.");
    await client.query("UPDATE sio_users SET role=$2 WHERE id=$1", [id, role]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function deleteUser(id: string, actorId: string): Promise<void> {
  if (id === actorId) throw new Error("Tu ne peux pas supprimer ton propre compte.");
  await ensureSchema();
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE sio_users IN EXCLUSIVE MODE");
    const target = (await client.query("SELECT role FROM sio_users WHERE id=$1", [id])).rows[0];
    if (!target) throw new Error("Compte introuvable.");
    if (target.role === "ADMIN" && Number((await client.query("SELECT count(*) AS total FROM sio_users WHERE role='ADMIN'")).rows[0].total) <= 1) throw new Error("Il faut conserver au moins un administrateur.");
    await client.query("DELETE FROM sio_users WHERE id=$1", [id]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function updateUserEmail(id: string, email: string): Promise<void> {
  await ensureSchema();
  const result = await database().query("UPDATE sio_users SET email=$2 WHERE id=$1", [id, email]);
  if (!result.rowCount) throw new Error("Compte introuvable.");
}

export async function updatePassword(id: string, password: string, currentPassword?: string): Promise<void> {
  await ensureSchema();
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT password_hash FROM sio_users WHERE id=$1 FOR UPDATE", [id]);
    if (!result.rows[0]) throw new Error("Compte introuvable.");
    if (currentPassword !== undefined && !await verifyPassword(currentPassword, result.rows[0].password_hash as string)) throw new Error("Mot de passe actuel incorrect.");
    await client.query("UPDATE sio_users SET password_hash=$2,failed_attempts=0,locked_until=NULL WHERE id=$1", [id, await hashPassword(password)]);
    await client.query("DELETE FROM sio_sessions WHERE user_id=$1", [id]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
