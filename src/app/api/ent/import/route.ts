import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { importEntFiles } from "@/lib/ent-store";

export const runtime = "nodejs";

const fields = z.object({ subjectId: z.uuid(), parentId: z.union([z.uuid(), z.literal("")]).default("") });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  if ((await getCurrentUser())?.role !== "ADMIN") return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "Envoi invalide." }, { status: 400 }); }
  const parsed = fields.safeParse({ subjectId: form.get("subjectId"), parentId: form.get("parentId") ?? "" });
  const incoming = form.getAll("files");
  const paths = form.getAll("paths");
  if (!parsed.success || !incoming.length || incoming.length !== paths.length || incoming.length > 300 || incoming.some((item) => !(item instanceof File)) || paths.some((item) => typeof item !== "string")) {
    return Response.json({ error: "Choisissez une matière et jusqu’à 300 fichiers à importer." }, { status: 400 });
  }
  const source = incoming as File[];
  if (source.some((file) => file.size > 50 * 1024 * 1024) || source.reduce((total, file) => total + file.size, 0) > 100 * 1024 * 1024) {
    return Response.json({ error: "Un fichier dépasse 50 Mo ou l’envoi dépasse 100 Mo." }, { status: 400 });
  }
  try {
    const original = await Promise.all(source.map(async (file, index) => ({ relativePath: paths[index] as string, content: Buffer.from(await file.arrayBuffer()) })));
    const result = await importEntFiles({ subjectId: parsed.data.subjectId, parentId: parsed.data.parentId || null, files: original });
    return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Import impossible." }, { status: 400 });
  }
}
