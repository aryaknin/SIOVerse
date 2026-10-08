import { createSession, registerUser } from "@/lib/auth";
import { newUserSchema, sameOrigin } from "@/lib/auth-input";
import { z } from "zod";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  let data: unknown;
  try { data = await request.json(); } catch { return Response.json({ error: "Requête invalide." }, { status: 400 }); }
  const parsed = newUserSchema.extend({ inviteCode: z.string().trim().optional() }).safeParse(data);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Vérifie les informations du compte." }, { status: 400 });
  try {
    const url = new URL(request.url);
    const localBootstrap = process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const user = await registerUser(parsed.data, localBootstrap, parsed.data.inviteCode);
    await createSession(user.id);
    return Response.json({ user }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && /(déjà utilisé|invitation|Invitation)/.test(error.message) ? error.message : "Création impossible. Vérifie que PostgreSQL est démarré.";
    return Response.json({ error: message }, { status: /déjà utilisé/.test(message) ? 409 : /invitation/i.test(message) ? 403 : 500 });
  }
}
