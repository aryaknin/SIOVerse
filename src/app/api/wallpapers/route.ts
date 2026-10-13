import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { addCustomWallpaper, deleteCustomWallpaper, listCustomWallpapers } from "@/lib/wallpapers";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  try { return Response.json({ wallpapers: await listCustomWallpapers(user.id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "Fonds d’écran indisponibles." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("wallpaper") ?? form.get("gif");
    const name = z.string().trim().min(2).max(60).safeParse(form.get("name"));
    if (!name.success || !(file instanceof File) || file.size < 8 || file.size > 10 * 1024 * 1024) return Response.json({ error: "Donne un nom et choisis une image ou un GIF de 10 Mo maximum." }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const mediaType = ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6)) ? "image/gif"
      : bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "image/png"
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg"
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
    if (!mediaType) return Response.json({ error: "Format non reconnu. Utilise GIF, PNG, JPEG ou WebP." }, { status: 400 });
    const wallpaper = await addCustomWallpaper(user.id, name.data, bytes, mediaType);
    return Response.json({ wallpaper }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Import impossible." }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  const parsed = z.object({ id: z.uuid() }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Fond d’écran invalide." }, { status: 400 });
  return Response.json({ removed: await deleteCustomWallpaper(user.id, parsed.data.id) }, { headers: { "Cache-Control": "no-store" } });
}
