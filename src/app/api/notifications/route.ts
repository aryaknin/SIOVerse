import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { markNotificationsRead, notificationCenter, saveNotificationPreferences } from "@/lib/notifications";

export const runtime = "nodejs";

const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), id: z.uuid().optional() }),
  z.object({ action: z.literal("preferences"), preferences: z.object({ resources: z.boolean(), assessments: z.boolean(), accounts: z.boolean(), memes: z.boolean() }) }),
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  try { return Response.json(await notificationCenter(user.id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "Notifications indisponibles." }, { status: 503 }); }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Réglage invalide." }, { status: 400 });
  try {
    if (parsed.data.action === "read") await markNotificationsRead(user.id, parsed.data.id);
    else await saveNotificationPreferences(user.id, parsed.data.preferences);
    return Response.json(await notificationCenter(user.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Mise à jour impossible." }, { status: 503 }); }
}
