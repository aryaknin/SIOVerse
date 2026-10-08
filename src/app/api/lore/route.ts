import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { createLoreEntry, listLoreEntries } from "@/lib/lore";
import { ensureMemesSchema, listArticleMemeLinks } from "@/lib/memes";
import { listContentPeople } from "@/lib/people";
import { concernedPeopleSchema } from "@/lib/people-input";
import { wikiCategoryIds } from "@/lib/wiki-categories";

export const runtime = "nodejs";

const schema = z.object({ title: z.string().trim().min(2).max(120), body: z.string().trim().min(10).max(12000), category: z.enum(wikiCategoryIds), memeIds: z.array(z.uuid()).max(8), personKeys: concernedPeopleSchema });

export async function GET() {
  if (!await getCurrentUser()) return Response.json({ error: "Connexion requise." }, { status: 401 });
  try { await ensureMemesSchema(); const [entries, links, concerned] = await Promise.all([listLoreEntries(), listArticleMemeLinks(), listContentPeople()]); return Response.json({ entries, links, concerned }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "Lore indisponible." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  try {
    const form = await request.formData();
    const parsed = schema.safeParse({ title: form.get("title"), body: form.get("body"), category: form.get("category"), memeIds: form.getAll("memeIds"), personKeys: form.getAll("personKeys") });
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Contenu invalide." }, { status: 400 });
    if (new Set(parsed.data.memeIds).size !== parsed.data.memeIds.length) return Response.json({ error: "Un même GIF est sélectionné plusieurs fois." }, { status: 400 });
    await ensureMemesSchema();
    await createLoreEntry({ ...parsed.data, authorId: user.id });
    const [entries, links, concerned] = await Promise.all([listLoreEntries(), listArticleMemeLinks(), listContentPeople()]);
    return Response.json({ entries, links, concerned }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Création impossible." }, { status: 400 }); }
}
