import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import {
  continueMakeItSio,
  createMakeItSioLobby,
  getMakeItSioLobby,
  joinMakeItSioLobby,
  leaveMakeItSioLobby,
  rematchMakeItSio,
  startMakeItSioGame,
  submitMakeItSioCaption,
  updateMakeItSioSettings,
  voteMakeItSio,
} from "@/lib/makeitsio";

export const runtime = "nodejs";

const code = z.string().trim().min(6).max(8);
const profile = {
  name: z.string().trim().min(2).max(28),
  avatar: z.string().max(450_000).nullable().optional(),
};
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...profile }),
  z.object({ action: z.literal("join"), code, ...profile }),
  z.object({
    action: z.literal("settings"),
    code,
    totalRounds: z.number().int().min(1).max(10),
    captionSeconds: z.number().int().min(30).max(300),
  }),
  z.object({ action: z.literal("start"), code }),
  z.object({
    action: z.literal("caption"),
    code,
    topText: z.string().max(100),
    bottomText: z.string().max(100),
  }),
  z.object({
    action: z.literal("vote"),
    code,
    submissionId: z.uuid(),
    value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
    buddy: z.boolean(),
  }),
  z.object({ action: z.literal("continue"), code }),
  z.object({ action: z.literal("rematch"), code }),
  z.object({ action: z.literal("leave"), code }),
]);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  const lobby = await getMakeItSioLobby(
    new URL(request.url).searchParams.get("code") ?? "",
    user.id,
  ).catch(() => null);
  if (!lobby)
    return Response.json(
      { error: "Salon introuvable ou quitté." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  return Response.json(
    { lobby },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: "Origine de requête refusée." },
      { status: 403 },
    );
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Action invalide." },
      { status: 400 },
    );
  try {
    const input = parsed.data;
    if (input.action === "leave") {
      await leaveMakeItSioLobby(user.id, input.code);
      return Response.json({ ok: true });
    }
    const lobby =
      input.action === "create"
        ? await createMakeItSioLobby(user, input)
        : input.action === "join"
          ? await joinMakeItSioLobby(user, input)
          : input.action === "settings"
            ? await updateMakeItSioSettings(user.id, input.code, input)
            : input.action === "start"
              ? await startMakeItSioGame(user.id, input.code)
              : input.action === "caption"
                ? await submitMakeItSioCaption(user.id, input.code, input)
                : input.action === "vote"
                  ? await voteMakeItSio(user.id, input.code, input)
                  : input.action === "continue"
                    ? await continueMakeItSio(user.id, input.code)
                    : await rematchMakeItSio(user.id, input.code);
    return Response.json(
      { lobby },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Action impossible." },
      { status: 400 },
    );
  }
}
