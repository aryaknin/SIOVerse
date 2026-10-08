import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { editWiki, listLoreEntries, restoreWikiRevision } from "@/lib/lore";
import { listArticleMemeLinks } from "@/lib/memes";
import { wikiCategoryIds } from "@/lib/wiki-categories";

export const runtime = "nodejs";

const articleId = z.uuid();
const title = z.string().trim().min(2).max(120);
const body = z.string().trim().max(12000);
const expectedUpdatedAt = z.iso.datetime({ offset: true });
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("article"), articleId, title, body, category: z.enum(wikiCategoryIds), expectedUpdatedAt }),
  z.object({ action: z.literal("section-add"), articleId, title, body }),
  z.object({ action: z.literal("section-edit"), articleId, sectionId: z.uuid(), title, body, expectedUpdatedAt }),
  z.object({ action: z.literal("section-delete"), articleId, sectionId: z.uuid(), expectedUpdatedAt }),
  z.object({ action: z.literal("section-order"), articleId, sectionIds: z.array(z.uuid()).max(50), expectedUpdatedAt }),
  z.object({ action: z.literal("media"), articleId, memeIds: z.array(z.uuid()).max(8) }),
  z.object({ action: z.literal("restore"), articleId, revisionId: z.uuid() }),
]);

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Modification invalide." }, { status: 400 });
    if (parsed.data.action === "restore") {
      if (user.role !== "ADMIN") return Response.json({ error: "Seul un administrateur peut restaurer une version." }, { status: 403 });
      await restoreWikiRevision(parsed.data.articleId, parsed.data.revisionId, user.id);
    } else await editWiki({ ...parsed.data, editorId: user.id });
    const [entries, links] = await Promise.all([listLoreEntries(), listArticleMemeLinks()]);
    return Response.json({ entries, links }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Modification impossible." }, { status: 400 }); }
}
