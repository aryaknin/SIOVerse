import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { createEntResourcesBundle, deleteEntResources, moveEntResources } from "@/lib/ent-store";

export const runtime = "nodejs";

const ids = z.array(z.uuid()).min(1).max(100).refine((items) => new Set(items).size === items.length, "Sélection invalide.");
const moveSchema = z.object({ ids, subjectId: z.uuid(), parentId: z.uuid() });
const selectionSchema = z.object({ ids });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  if (!await getCurrentUser()) return Response.json({ error: "Connexion requise." }, { status: 401 });
  const parsed = selectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Sélection invalide." }, { status: 400 });
  try {
    const archive = await createEntResourcesBundle(parsed.data.ids);
    return new Response(new Uint8Array(archive), { headers: { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename*=UTF-8''ressources-sioverse.zip", "Content-Length": String(archive.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Téléchargement impossible." }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  if ((await getCurrentUser())?.role !== "ADMIN") return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  const parsed = moveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Destination ou sélection invalide." }, { status: 400 });
  try { return Response.json(await moveEntResources(parsed.data), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Déplacement impossible." }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  if ((await getCurrentUser())?.role !== "ADMIN") return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  const parsed = selectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Sélection invalide." }, { status: 400 });
  try { return Response.json(await deleteEntResources(parsed.data.ids), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Suppression impossible." }, { status: 400 }); }
}
