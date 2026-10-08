import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { updatePersonProfile } from "@/lib/people";

export const runtime = "nodejs";

const schema = z.object({
  key: z.string().regex(/^(user|person):[0-9a-f-]{36}$/i),
  headline: z.string().trim().max(100),
  bio: z.string().trim().max(3000),
});

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Connexion requise." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Profil invalide." }, { status: 400 });
  if (actor.role !== "ADMIN" && parsed.data.key !== `user:${actor.id}`) return Response.json({ error: "Tu peux modifier uniquement ton profil." }, { status: 403 });
  try {
    await updatePersonProfile(parsed.data.key, parsed.data.headline, parsed.data.bio);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Modification impossible." }, { status: 400 }); }
}
