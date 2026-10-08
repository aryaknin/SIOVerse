import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/auth-input";
import { addNamedPerson, listPeopleOptions } from "@/lib/people";

export const runtime = "nodejs";

const schema = z.object({ name: z.string().trim().min(2).max(80), kind: z.enum(["TEACHER", "OTHER"]) });

export async function GET() {
  if (!await getCurrentUser()) return Response.json({ error: "Connexion requise." }, { status: 401 });
  try { return Response.json({ people: await listPeopleOptions() }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "Liste des personnes indisponible." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine de requête refusée." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Personne invalide." }, { status: 400 });
    const person = await addNamedPerson(parsed.data.name.replace(/\s+/g, " "), parsed.data.kind);
    return Response.json({ person }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Ajout impossible." }, { status: 400 }); }
}
