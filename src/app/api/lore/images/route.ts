import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { addWikiImage, deleteWikiImage, listWikiImages } from "@/lib/lore";

export const runtime = "nodejs";

const uploadSchema = z.object({
  articleId: z.uuid(),
  caption: z.string().trim().max(240),
});
const deleteSchema = z.object({ articleId: z.uuid(), imageId: z.uuid() });

function detectImage(bytes: Buffer): string | null {
  if (["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6)))
    return "image/gif";
  if (
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: "Origine de requête refusée." },
      { status: 403 },
    );
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  try {
    const form = await request.formData();
    const parsed = uploadSchema.safeParse({
      articleId: form.get("articleId"),
      caption: form.get("caption") ?? "",
    });
    if (!parsed.success)
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Informations invalides." },
        { status: 400 },
      );
    const image = form.get("image");
    if (
      !(image instanceof File) ||
      image.size < 8 ||
      image.size > 10 * 1024 * 1024
    )
      return Response.json(
        { error: "Choisis une image de 10 Mo maximum." },
        { status: 400 },
      );
    const content = Buffer.from(await image.arrayBuffer());
    const mediaType = detectImage(content);
    if (!mediaType)
      return Response.json(
        { error: "Format non reconnu. Utilise GIF, PNG, JPEG ou WebP." },
        { status: 400 },
      );
    const fileName =
      image.name.replace(/[\r\n]/g, " ").slice(0, 180) || "illustration";
    await addWikiImage({
      ...parsed.data,
      uploaderId: user.id,
      fileName,
      mediaType,
      content,
    });
    return Response.json(
      { images: await listWikiImages() },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Import impossible." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: "Origine de requête refusée." },
      { status: 403 },
    );
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  try {
    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success)
      return Response.json({ error: "Image invalide." }, { status: 400 });
    await deleteWikiImage(parsed.data.imageId, parsed.data.articleId, user.id);
    return Response.json(
      { images: await listWikiImages() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Suppression impossible.",
      },
      { status: 400 },
    );
  }
}
