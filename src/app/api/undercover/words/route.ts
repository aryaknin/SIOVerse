import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { addUndercoverWord, deleteUndercoverWord, listUndercoverWords, updateUndercoverWord } from "@/lib/undercover";

export const runtime = "nodejs";

const pairSchema = z.object({ mode: z.enum(["NORMAL", "SIO"]), civil: z.string().trim().min(1).max(60), undercover: z.string().trim().min(1).max(60) });
const editSchema = z.object({ id: z.uuid(), civil: z.string().trim().min(1).max(60).optional(), undercover: z.string().trim().min(1).max(60).optional(), enabled: z.boolean().optional() });

async function admin() { return (await getCurrentUser())?.role === "ADMIN"; }

export async function GET() {
  if (!await admin()) return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  return Response.json({ words: await listUndercoverWords() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  const parsed = pairSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Renseigne deux mots valides." }, { status: 400 });
  try { return Response.json({ words: await addUndercoverWord(user.id, parsed.data) }, { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Ajout impossible." }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  if (!await admin()) return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Modification invalide." }, { status: 400 });
  try { return Response.json({ words: await updateUndercoverWord(parsed.data.id, parsed.data) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Modification impossible." }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  if (!await admin()) return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  const parsed = z.object({ id: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Paire invalide." }, { status: 400 });
  try { return Response.json({ words: await deleteUndercoverWord(parsed.data.id) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Suppression impossible." }, { status: 400 }); }
}
