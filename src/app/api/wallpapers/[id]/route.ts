import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getCustomWallpaper } from "@/lib/wallpapers";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 400 });
  const gif = await getCustomWallpaper(user.id, id);
  if (!gif) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(gif), { headers: { "Content-Type": "image/gif", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300" } });
}
