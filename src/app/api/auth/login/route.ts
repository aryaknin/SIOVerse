import { authenticateUser, createSession } from "@/lib/auth";
import { loginSchema, sameOrigin } from "@/lib/auth-input";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  let data: unknown;
  try { data = await request.json(); } catch { return Response.json({ error: "Requête invalide." }, { status: 400 }); }
  const parsed = loginSchema.safeParse(data);
  if (!parsed.success) return Response.json({ error: "Identifiant et mot de passe requis." }, { status: 400 });
  try {
    const user = await authenticateUser(parsed.data.identifier, parsed.data.password);
    if (!user) return Response.json({ error: "Identifiant ou mot de passe incorrect." }, { status: 401 });
    await createSession(user.id);
    return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Trop de tentatives")) return Response.json({ error: error.message }, { status: 429 });
    return Response.json({ error: "Connexion impossible. Vérifie PostgreSQL." }, { status: 503 });
  }
}
