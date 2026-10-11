import { getCurrentUser } from "@/lib/auth";
import { readEntDocument } from "@/lib/ent-store";
import { buildEntPreview, renderOfficePdf } from "@/lib/ent-preview";

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext<"/api/ent/preview/[id]">) {
  if (!await getCurrentUser()) return new Response(null, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const document = await readEntDocument(id);
  if (!document) return new Response(null, { status: 404 });

  if (new URL(request.url).searchParams.get("format") === "pdf") {
    try {
      const pdf = await renderOfficePdf(document.resource, document.content);
      return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" } });
    } catch {
      return Response.json({ error: "La conversion locale de ce document a échoué." }, { status: 422 });
    }
  }

  return Response.json(await buildEntPreview(document.resource, document.content), { headers: { "Cache-Control": "private, no-store" } });
}
