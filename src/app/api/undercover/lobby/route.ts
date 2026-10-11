import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import {
  createUndercoverLobby,
  getUndercoverLobby,
  joinUndercoverLobby,
  kickUndercoverMember,
  leaveUndercoverLobby,
  rematchUndercover,
  startUndercoverGame,
  submitUndercoverClue,
  submitUndercoverVote,
  submitWhiteGuess,
  updateUndercoverProfile,
  updateUndercoverSettings,
} from "@/lib/undercover";

export const runtime = "nodejs";

const code = z.string().trim().min(6).max(8);
const avatar = z.string().max(450_000).nullable().optional();
const profile = { name: z.string().trim().min(2).max(28), avatar };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...profile }),
  z.object({ action: z.literal("join"), code, ...profile }),
  z.object({ action: z.literal("profile"), code, ...profile }),
  z.object({ action: z.literal("settings"), code, wordMode: z.enum(["NORMAL", "SIO"]), undercoverCount: z.number().int().min(1).max(8), misterWhite: z.boolean() }),
  z.object({ action: z.literal("start"), code }),
  z.object({ action: z.literal("clue"), code, clue: z.string().trim().min(1).max(40) }),
  z.object({ action: z.literal("vote"), code, targetId: z.uuid() }),
  z.object({ action: z.literal("guess"), code, guess: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("rematch"), code }),
  z.object({ action: z.literal("leave"), code }),
  z.object({ action: z.literal("kick"), code, memberId: z.uuid() }),
]);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  const lobby = await getUndercoverLobby(new URL(request.url).searchParams.get("code") ?? "", user.id).catch(() => null);
  if (!lobby) return Response.json({ error: "Salon introuvable ou quitté." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json({ lobby }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Action invalide." }, { status: 400 });
  try {
    const input = parsed.data;
    if (input.action === "leave") { await leaveUndercoverLobby(user.id, input.code); return Response.json({ ok: true }); }
    const lobby = input.action === "create" ? await createUndercoverLobby(user, input)
      : input.action === "join" ? await joinUndercoverLobby(user, input)
        : input.action === "profile" ? await updateUndercoverProfile(user, input.code, input)
          : input.action === "settings" ? await updateUndercoverSettings(user.id, input.code, input)
            : input.action === "start" ? await startUndercoverGame(user.id, input.code)
              : input.action === "clue" ? await submitUndercoverClue(user.id, input.code, input.clue)
                : input.action === "vote" ? await submitUndercoverVote(user.id, input.code, input.targetId)
                  : input.action === "guess" ? await submitWhiteGuess(user.id, input.code, input.guess)
                    : input.action === "rematch" ? await rematchUndercover(user.id, input.code)
                      : await kickUndercoverMember(user.id, input.code, input.memberId);
    return Response.json({ lobby }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Action impossible." }, { status: 400 });
  }
}
