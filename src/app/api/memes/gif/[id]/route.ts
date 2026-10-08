import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { memeMedia } from "@/lib/memes";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await getCurrentUser()) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 400 });
  const media = await memeMedia(id);
  if (!media) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(media.content), { headers: { "Content-Type": media.mimeType, "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300" } });
}
