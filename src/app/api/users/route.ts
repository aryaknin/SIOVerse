import { z } from "zod";
import { changeUserRole, createUserByAdmin, deleteUser, getCurrentUser, listUsers, updatePassword, updateUserEmail } from "@/lib/auth";
import { newUserSchema, passwordSchema, sameOrigin, schoolEmailSchema } from "@/lib/auth-input";
import { publishNotification } from "@/lib/notifications";

export const runtime = "nodejs";

const createSchema = newUserSchema.extend({ role: z.enum(["ADMIN", "MEMBER"]) });
const roleSchema = z.object({ id: z.uuid(), role: z.enum(["ADMIN", "MEMBER"]) });
const emailSchema = z.object({ id: z.uuid(), action: z.literal("email"), email: schoolEmailSchema });
const passwordChangeSchema = z.object({ id: z.uuid(), action: z.literal("password"), password: passwordSchema });
const deleteSchema = z.object({ id: z.uuid() });

async function admin() {
  const user = await getCurrentUser();
  return user?.role === "ADMIN" ? user : null;
}

export async function GET() {
  try {
    const actor = await admin();
    if (!actor) return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
    return Response.json({ users: await listUsers() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Gestion des utilisateurs indisponible." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  try {
    const actor = await admin();
    if (!actor) return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Informations invalides." }, { status: 400 });
    const created = await createUserByAdmin(parsed.data);
    await publishNotification({ category: "ACCOUNTS", title: "Compte créé", body: `${actor.username} a créé ton compte SIOVerse.`, audience: [created.id] });
    return Response.json({ users: await listUsers() }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Création impossible." }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  try {
    const actor = await admin();
    if (!actor) return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
    const body = await request.json();
    let notificationTitle = "Compte modifié";
    let notificationBody = `${actor.username} a modifié ton compte.`;
    let targetId = "";
    if (body?.action === "email") {
      const parsed = emailSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Adresse invalide." }, { status: 400 });
      await updateUserEmail(parsed.data.id, parsed.data.email);
      targetId = parsed.data.id; notificationTitle = "Adresse e-mail modifiée"; notificationBody = `${actor.username} a modifié l’adresse e-mail de ton compte.`;
    } else if (body?.action === "password") {
      const parsed = passwordChangeSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Mot de passe invalide." }, { status: 400 });
      if (parsed.data.id === actor.id) return Response.json({ error: "Pour ton compte, utilise « Modifier mon mot de passe » dans le menu Démarrer." }, { status: 400 });
      await updatePassword(parsed.data.id, parsed.data.password);
      targetId = parsed.data.id; notificationTitle = "Mot de passe réinitialisé"; notificationBody = `${actor.username} a réinitialisé le mot de passe de ton compte.`;
    } else {
      const parsed = roleSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: "Rôle invalide." }, { status: 400 });
      await changeUserRole(parsed.data.id, parsed.data.role, actor.id);
      targetId = parsed.data.id; notificationTitle = "Rôle du compte modifié"; notificationBody = `Ton rôle est maintenant ${parsed.data.role === "ADMIN" ? "administrateur" : "membre"}.`;
    }
    await publishNotification({ category: "ACCOUNTS", title: notificationTitle, body: notificationBody, audience: [targetId] });
    return Response.json({ users: await listUsers() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Modification impossible." }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  try {
    const actor = await admin();
    if (!actor) return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Compte invalide." }, { status: 400 });
    const target = (await listUsers()).find((user) => user.id === parsed.data.id);
    await deleteUser(parsed.data.id, actor.id);
    await publishNotification({ category: "ACCOUNTS", title: "Compte supprimé", body: `${actor.username} a supprimé le compte ${target?.username ?? "d’un membre"}.`, href: "/utilisateurs", audience: "ADMINS" });
    return Response.json({ users: await listUsers() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Suppression impossible." }, { status: 400 }); }
}
