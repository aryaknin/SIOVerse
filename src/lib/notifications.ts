import "server-only";

import { randomUUID } from "node:crypto";
import { loreDatabase } from "./lore-db";

export type NotificationCategory = "RESOURCES" | "ASSESSMENTS" | "ACCOUNTS" | "MEMES";
export type SioNotification = { id: string; category: NotificationCategory; title: string; body: string; href: string | null; read: boolean; createdAt: string };
export type NotificationPreferences = { resources: boolean; assessments: boolean; accounts: boolean; memes: boolean };

const defaults: NotificationPreferences = { resources: true, assessments: true, accounts: true, memes: true };
let schemaReady: Promise<void> | null = null;

async function ensureNotificationSchema() {
  schemaReady ??= loreDatabase().query(`
    CREATE TABLE IF NOT EXISTS sio_notification_preferences (
      user_id uuid PRIMARY KEY REFERENCES sio_users(id) ON DELETE CASCADE,
      resources boolean NOT NULL DEFAULT true,
      assessments boolean NOT NULL DEFAULT true,
      accounts boolean NOT NULL DEFAULT true,
      memes boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sio_notifications (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES sio_users(id) ON DELETE CASCADE,
      category text NOT NULL CHECK (category IN ('RESOURCES','ASSESSMENTS','ACCOUNTS','MEMES')),
      title text NOT NULL,
      body text NOT NULL,
      href text,
      read_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS sio_notifications_user_date_idx ON sio_notifications(user_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS sio_notifications_unread_idx ON sio_notifications(user_id) WHERE read_at IS NULL;
  `).then(() => {}).catch((error) => { schemaReady = null; throw error; });
  await schemaReady;
}

function preferenceColumn(category: NotificationCategory): keyof NotificationPreferences {
  return category === "RESOURCES" ? "resources" : category === "ASSESSMENTS" ? "assessments" : category === "ACCOUNTS" ? "accounts" : "memes";
}

export async function notificationCenter(userId: string): Promise<{ notifications: SioNotification[]; unread: number; preferences: NotificationPreferences }> {
  await ensureNotificationSchema();
  const [items, preferences, unreadResult] = await Promise.all([
    loreDatabase().query("SELECT id,category,title,body,href,read_at,created_at FROM sio_notifications WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100", [userId]),
    loreDatabase().query("SELECT resources,assessments,accounts,memes FROM sio_notification_preferences WHERE user_id=$1", [userId]),
    loreDatabase().query("SELECT count(*)::integer AS total FROM sio_notifications WHERE user_id=$1 AND read_at IS NULL", [userId]),
  ]);
  const notifications = items.rows.map((row) => ({ id: row.id, category: row.category as NotificationCategory, title: row.title, body: row.body, href: row.href, read: Boolean(row.read_at), createdAt: row.created_at.toISOString() }));
  return { notifications, unread: unreadResult.rows[0].total as number, preferences: preferences.rows[0] ?? defaults };
}

export async function markNotificationsRead(userId: string, id?: string): Promise<void> {
  await ensureNotificationSchema();
  if (id) await loreDatabase().query("UPDATE sio_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2", [id, userId]);
  else await loreDatabase().query("UPDATE sio_notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND read_at IS NULL", [userId]);
}

export async function saveNotificationPreferences(userId: string, preferences: NotificationPreferences): Promise<void> {
  await ensureNotificationSchema();
  await loreDatabase().query(`INSERT INTO sio_notification_preferences(user_id,resources,assessments,accounts,memes)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET resources=$2,assessments=$3,accounts=$4,memes=$5,updated_at=now()`,
  [userId, preferences.resources, preferences.assessments, preferences.accounts, preferences.memes]);
}

export async function publishNotification(input: { category: NotificationCategory; title: string; body: string; href?: string; audience?: "ALL" | "ADMINS" | string[]; excludeUserId?: string }): Promise<void> {
  try {
    await ensureNotificationSchema();
    const audience = input.audience ?? "ALL";
    const recipients = Array.isArray(audience)
      ? await loreDatabase().query("SELECT id FROM sio_users WHERE id=ANY($1::uuid[])", [audience])
      : await loreDatabase().query("SELECT id FROM sio_users WHERE ($1::text='ALL' OR role='ADMIN') AND ($2::uuid IS NULL OR id<>$2)", [audience, input.excludeUserId ?? null]);
    const column = preferenceColumn(input.category);
    for (const row of recipients.rows) {
      const allowed = await loreDatabase().query(`SELECT COALESCE((SELECT ${column} FROM sio_notification_preferences WHERE user_id=$1),true) AS enabled`, [row.id]);
      if (!allowed.rows[0]?.enabled) continue;
      await loreDatabase().query("INSERT INTO sio_notifications(id,user_id,category,title,body,href) VALUES($1,$2,$3,$4,$5,$6)", [randomUUID(), row.id, input.category, input.title.slice(0, 160), input.body.slice(0, 500), input.href ?? null]);
    }
  } catch {
    // Une notification ne doit jamais annuler l’action métier qui l’a déclenchée.
  }
}
