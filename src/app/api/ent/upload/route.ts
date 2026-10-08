import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { addDocument } from "@/lib/ent-store";
import { entMimeTypes, fileExtension } from "@/lib/ent-file-types";

export const runtime = "nodejs";

const maxFileSize = 25 * 1024 * 1024;
const fields = z.object({
  chapterId: z.uuid(),
  title: z.string().trim().min(2).max(120),
  teacher: z.string().trim().max(120),
  kind: z.enum(["COURSE", "EXERCISE", "CORRECTION", "CHEATSHEET", "ARCHIVE"]),
});

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  if ((await getCurrentUser())?.role !== "ADMIN") return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "Envoi invalide." }, { status: 400 }); }
  const file = form.get("file");
  const parsed = fields.safeParse({ chapterId: form.get("chapterId"), title: form.get("title"), teacher: form.get("teacher") ?? "", kind: form.get("kind") });
  if (!parsed.success || !(file instanceof File)) return Response.json({ error: "Complétez le formulaire et choisissez un document." }, { status: 400 });
  if (file.size === 0 || file.size > maxFileSize) return Response.json({ error: "Le document doit faire entre 1 octet et 25 Mo." }, { status: 400 });
  const extension = fileExtension(file.name);
  if (!entMimeTypes[extension]) return Response.json({ error: "Ce format de fichier n’est pas encore pris en charge." }, { status: 400 });

  try {
    const catalog = await addDocument({ ...parsed.data, file, extension, mimeType: entMimeTypes[extension] });
    return Response.json(catalog, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Document non enregistré." }, { status: 400 });
  }
}
