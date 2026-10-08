import { revokeCurrentSession } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  try {
    await revokeCurrentSession();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Déconnexion impossible." }, { status: 503 }); }
}
