import { getCurrentUser, createInvite, listInvites } from "@/lib/auth";
import { sameOrigin, schoolEmailSchema } from "@/lib/auth-input";

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
  try { const invite = await createInvite(parsed.data, actor.id); return Response.json({ ...invite, invites: await listInvites() }, { status: 201, headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Invitation impossible." }, { status: 503 }); }
}
