import { memeTemplateMedia } from "@/lib/makeitsio";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/makeitsio/templates/[id]/media">,
) {
  if (!(await getCurrentUser()))
    return new Response("Connexion requise.", { status: 401 });
  const { id } = await context.params;
  const media = await memeTemplateMedia(id).catch(() => null);
  if (!media) return new Response("Modèle introuvable.", { status: 404 });
  return new Response(new Uint8Array(media.content), {
    headers: {
      "Content-Type": media.mimeType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
