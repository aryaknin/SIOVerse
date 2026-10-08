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
    const file = form.get("gif");
    const name = z.string().trim().min(2).max(60).safeParse(form.get("name"));
    if (!name.success || !(file instanceof File) || file.size < 6 || file.size > 10 * 1024 * 1024) return Response.json({ error: "Donne un nom et choisis un GIF de 10 Mo maximum." }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return Response.json({ error: "Ce fichier n’est pas un GIF valide." }, { status: 400 });
    const wallpaper = await addCustomWallpaper(user.id, name.data, bytes);
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
