import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { createMeme, listMemes } from "@/lib/memes";
import { concernedPeopleSchema } from "@/lib/people-input";

export const runtime = "nodejs";

const schema = z.object({ title: z.string().trim().min(2).max(120), body: z.string().trim().max(8000), personKeys: concernedPeopleSchema });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  try { return Response.json({ memes: await listMemes(user.id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "Mèmes indisponibles." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return Response.json({ error: "Accès administrateur requis." }, { status: 403 });
  try {
    const form = await request.formData();
    const parsed = schema.safeParse({ title: form.get("title"), body: form.get("body"), personKeys: form.getAll("personKeys") });
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Informations invalides." }, { status: 400 });
    const media = form.get("media");
    if (!(media instanceof File) || media.size < 8 || media.size > 10 * 1024 * 1024) return Response.json({ error: "Choisis un GIF ou une image de 10 Mo maximum." }, { status: 400 });
    const bytes = Buffer.from(await media.arrayBuffer());
    const mimeType = ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6)) ? "image/gif"
      : bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "image/png"
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg"
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
    if (!mimeType) return Response.json({ error: "Format non reconnu. Utilise GIF, PNG, JPEG ou WebP." }, { status: 400 });
    await createMeme({ ...parsed.data, media: bytes, mediaType: mimeType });
    return Response.json({ memes: await listMemes(user.id) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Publication impossible." }, { status: 400 }); }
}
