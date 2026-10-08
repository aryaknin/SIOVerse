import { readEntDocument } from "@/lib/ent-store";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/ent/files/[id]">) {
  if (!await getCurrentUser()) return new Response(null, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const document = await readEntDocument(id);
  if (!document) return new Response(null, { status: 404 });
  const { resource, content } = document;
  const previewable = /^(application\/pdf|image\/(png|jpeg|webp)|text\/plain)$/.test(resource.mimeType ?? "");
  return new Response(new Uint8Array(content), {
    headers: {
      "Content-Type": resource.mimeType ?? "application/octet-stream",
      "Content-Disposition": `${previewable ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(resource.originalName ?? "document")}`,
      "Content-Length": String(content.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
