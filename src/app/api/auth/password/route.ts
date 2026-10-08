import { createSession, getCurrentUser, updatePassword } from "@/lib/auth";
import { passwordSchema, sameOrigin } from "@/lib/auth-input";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Session expirée." }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Mot de passe invalide." }, { status: 400 });
  try {
    await updatePassword(user.id, parsed.data.newPassword, parsed.data.currentPassword);
    await createSession(user.id);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Modification impossible." }, { status: 400 });
  }
}
