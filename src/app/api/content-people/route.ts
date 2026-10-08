import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { listContentPeople, replaceContentPeople } from "@/lib/people";
import { concernedPeopleSchema } from "@/lib/people-input";
import { ensureLoreSchema, loreDatabase } from "@/lib/lore-db";

export const runtime = "nodejs";

const schema = z.object({ contentId: z.uuid(), personKeys: concernedPeopleSchema });

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Sélection invalide." }, { status: 400 });
    await ensureLoreSchema();
    const content = await loreDatabase().query("SELECT kind FROM sio_lore_entries WHERE id=$1", [parsed.data.contentId]);
    if (!content.rows[0]) return Response.json({ error: "Contenu introuvable." }, { status: 404 });
    if (content.rows[0].kind !== "ARTICLE" && user.role !== "ADMIN") return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
    await replaceContentPeople(parsed.data.contentId, parsed.data.personKeys);
    return Response.json({ concerned: await listContentPeople() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Modification impossible." }, { status: 400 }); }
}
