import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { addAssessment, addChapter, addLink, addSubject, deleteEntItem, moveEntItem, readEntCatalog, renameEntItem } from "@/lib/ent-store";

export const runtime = "nodejs";

const short = z.string().trim().min(2).max(120);
const optionalText = z.string().trim().max(120).default("");
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subject"), name: short, teacher: optionalText }),
  z.object({ action: z.literal("chapter"), subjectId: z.uuid(), parentId: z.uuid().nullable().optional(), title: short }),
  z.object({ action: z.literal("link"), chapterId: z.uuid(), title: short, teacher: optionalText, url: z.url().refine((value) => /^https?:\/\//i.test(value), "Seuls les liens web sont acceptés.") }),
  z.object({ action: z.literal("assessment"), kind: z.enum(["CONTROL", "HOMEWORK"]), title: short, subjectId: z.uuid(), chapterIds: z.array(z.uuid()).min(1), scheduledAt: z.iso.datetime(), details: z.string().trim().max(4000).default(""), room: optionalText }),
]);
const changeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), kind: z.enum(["subject", "chapter", "resource"]), id: z.uuid(), name: short, teacher: optionalText.optional() }),
  z.object({ action: z.literal("move"), kind: z.enum(["chapter", "resource"]), id: z.uuid(), subjectId: z.uuid(), parentId: z.uuid().nullable() }),
]);
const deleteSchema = z.object({ kind: z.enum(["subject", "chapter", "resource"]), id: z.uuid() });

export async function GET() {
  try {
    if (!await getCurrentUser()) return Response.json({ error: "Connexion requise." }, { status: 401 });
    return Response.json(await readEntCatalog(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Impossible de lire les données locales de l’ENT." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  if ((await getCurrentUser())?.role !== "ADMIN") return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  let data: unknown;
  try { data = await request.json(); } catch { return Response.json({ error: "Requête invalide." }, { status: 400 }); }
  const parsed = changeSchema.safeParse(data);
  if (!parsed.success) return Response.json({ error: "Vérifiez les champs du formulaire." }, { status: 400 });
  try {
    const catalog = parsed.data.action === "rename" ? await renameEntItem(parsed.data) : await moveEntItem(parsed.data);
    return Response.json(catalog, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Modification impossible." }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  if ((await getCurrentUser())?.role !== "ADMIN") return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  let data: unknown;
  try { data = await request.json(); } catch { return Response.json({ error: "Requête invalide." }, { status: 400 }); }
  const parsed = deleteSchema.safeParse(data);
  if (!parsed.success) return Response.json({ error: "Élément invalide." }, { status: 400 });
  try {
    return Response.json(await deleteEntItem(parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Suppression impossible." }, { status: 400 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  if ((await getCurrentUser())?.role !== "ADMIN") return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  let data: unknown;
  try { data = await request.json(); } catch { return Response.json({ error: "Requête invalide." }, { status: 400 }); }
  const parsed = inputSchema.safeParse(data);
  if (!parsed.success) return Response.json({ error: "Vérifiez les champs du formulaire." }, { status: 400 });

  try {
    const input = parsed.data;
    const catalog = input.action === "subject" ? await addSubject(input)
      : input.action === "chapter" ? await addChapter(input)
        : input.action === "link" ? await addLink(input)
          : await addAssessment(input);
    return Response.json(catalog, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Enregistrement impossible." }, { status: 400 });
  }
}
