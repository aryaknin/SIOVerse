import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import {
  createMemePack,
  createMemeTemplate,
  createMemeTopic,
  deleteMemeStudioItem,
  listMemeStudio,
  updateMemeStudioItem,
} from "@/lib/makeitsio";

export const runtime = "nodejs";

async function admin() {
  const user = await getCurrentUser();
  return user?.role === "ADMIN" ? user : null;
}

export async function GET() {
  if (!(await admin()))
    return Response.json(
      { error: "Accès administrateur requis." },
      { status: 403 },
    );
  return Response.json(await listMemeStudio(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  if (!(await admin()))
    return Response.json(
      { error: "Accès administrateur requis." },
      { status: 403 },
    );
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File))
        throw new Error("Choisis une image ou un GIF.");
      return Response.json(
        await createMemeTemplate(
          String(form.get("packId") ?? ""),
          String(form.get("title") ?? file.name),
          Buffer.from(await file.arrayBuffer()),
          file.type,
        ),
        { status: 201 },
      );
    }
    const body = z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("pack"), name: z.string().min(2).max(60) }),
        z.object({
          kind: z.literal("topic"),
          name: z.string().min(3).max(120),
        }),
      ])
      .parse(await request.json());
    return Response.json(
      body.kind === "pack"
        ? await createMemePack(body.name)
        : await createMemeTopic(body.name),
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Création impossible.",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request) || !(await admin()))
    return Response.json({ error: "Accès refusé." }, { status: 403 });
  const parsed = z
    .object({
      kind: z.enum(["pack", "template", "topic"]),
      id: z.uuid(),
      name: z.string().max(120).optional(),
      enabled: z.boolean().optional(),
      packId: z.uuid().optional(),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Modification invalide." }, { status: 400 });
  try {
    return Response.json(
      await updateMemeStudioItem(parsed.data.kind, parsed.data.id, parsed.data),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Modification impossible.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request) || !(await admin()))
    return Response.json({ error: "Accès refusé." }, { status: 403 });
  const parsed = z
    .object({ kind: z.enum(["pack", "template", "topic"]), id: z.uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Suppression invalide." }, { status: 400 });
  try {
    return Response.json(
      await deleteMemeStudioItem(parsed.data.kind, parsed.data.id),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Suppression impossible.",
      },
      { status: 400 },
    );
  }
}
