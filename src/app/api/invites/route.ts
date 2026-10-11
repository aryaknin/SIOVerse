import { getCurrentUser, createInvite, listInvites, revokeInvite } from "@/lib/auth";
import { sameOrigin, schoolEmailSchema } from "@/lib/auth-input";
import { publishNotification } from "@/lib/notifications";

export const runtime = "nodejs";

export async function GET() {
  if ((await getCurrentUser())?.role !== "ADMIN") return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  try { return Response.json({ invites: await listInvites() }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "Invitations indisponibles." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  const actor = await getCurrentUser();
  if (actor?.role !== "ADMIN") return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = schoolEmailSchema.safeParse(body?.email);
  if (!parsed.success) return Response.json({ error: "Adresse @ortmontreuil.fr invalide." }, { status: 400 });
  try { const invite = await createInvite(parsed.data, actor.id); await publishNotification({ category: "ACCOUNTS", title: "Invitation créée", body: `${actor.username} a créé une invitation pour ${parsed.data}.`, href: "/utilisateurs", audience: "ADMINS" }); return Response.json({ ...invite, invites: await listInvites() }, { status: 201, headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Invitation impossible." }, { status: 503 }); }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  const actor = await getCurrentUser();
  if (actor?.role !== "ADMIN") return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!/^[a-f0-9]{64}$/.test(id)) return Response.json({ error: "Invitation invalide." }, { status: 400 });
  try {
    if (!await revokeInvite(id)) return Response.json({ error: "Cette invitation n’existe plus ou a déjà été utilisée." }, { status: 404 });
    await publishNotification({ category: "ACCOUNTS", title: "Invitation révoquée", body: `${actor.username} a révoqué une invitation en attente.`, href: "/utilisateurs", audience: "ADMINS" });
    return Response.json({ invites: await listInvites() }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Révocation impossible." }, { status: 503 }); }
}
