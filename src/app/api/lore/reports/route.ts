import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { createWikiReport, listWikiReports, resolveWikiReport } from "@/lib/wiki-reports";

export const runtime = "nodejs";

export async function GET() {
  if ((await getCurrentUser())?.role !== "ADMIN") return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  try { return Response.json({ reports: await listWikiReports() }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "Signalements indisponibles." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  const parsed = z.object({ articleId: z.uuid(), reason: z.string().trim().min(10).max(500) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Explique le problème en 10 à 500 caractères." }, { status: 400 });
  try { await createWikiReport(parsed.data.articleId, user.id, parsed.data.reason); return Response.json({ ok: true }, { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Signalement impossible." }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  if ((await getCurrentUser())?.role !== "ADMIN") return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  const parsed = z.object({ id: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Signalement invalide." }, { status: 400 });
  try { await resolveWikiReport(parsed.data.id); return Response.json({ reports: await listWikiReports() }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Action impossible." }, { status: 400 }); }
}
