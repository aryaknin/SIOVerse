import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { addMemeComment, deleteMemeComment, memeDetail, setMemeReaction } from "@/lib/memes";

export const runtime = "nodejs";

const routeId = z.uuid();
const commentSchema = z.object({ body: z.string().trim().min(1, "Écris un commentaire.").max(1000) });
const reactionSchema = z.object({ kind: z.enum(["like", "favorite"]), active: z.boolean() });
const deleteSchema = z.object({ commentId: z.uuid() });
type Context = { params: Promise<{ id: string }> };

async function context(request: Request, route: Context, writes = false) {
  if (writes && !sameOrigin(request)) return { error: Response.json({ error: "Origine de requête refusée." }, { status: 403 }) };
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "Connexion requise." }, { status: 401 }) };
  const { id } = await route.params;
  if (!routeId.safeParse(id).success) return { error: Response.json({ error: "Mème invalide." }, { status: 400 }) };
  return { user, id };
}

function failure(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Action impossible." }, { status: 400 });
}

export async function GET(request: Request, route: Context) {
  const access = await context(request, route);
  if (access.error) return access.error;
  try { return Response.json(await memeDetail(access.id!, access.user!.id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request, route: Context) {
  const access = await context(request, route, true);
  if (access.error) return access.error;
  try {
    const parsed = commentSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Commentaire invalide." }, { status: 400 });
    await addMemeComment(access.id!, access.user!.id, access.user!.username, parsed.data.body);
    return Response.json(await memeDetail(access.id!, access.user!.id), { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request, route: Context) {
  const access = await context(request, route, true);
  if (access.error) return access.error;
  try {
    const parsed = reactionSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Réaction invalide." }, { status: 400 });
    await setMemeReaction(access.id!, access.user!.id, parsed.data.kind, parsed.data.active);
    return Response.json(await memeDetail(access.id!, access.user!.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, route: Context) {
  const access = await context(request, route, true);
  if (access.error) return access.error;
  try {
    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Commentaire invalide." }, { status: 400 });
    await deleteMemeComment(access.id!, parsed.data.commentId, access.user!.id, access.user!.role === "ADMIN");
    return Response.json(await memeDetail(access.id!, access.user!.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
