import { z } from "zod";

export const newUserSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,29}$/, "Identifiant : 3 à 30 caractères, lettres, chiffres, point, tiret ou souligné."),
  email: z.email().trim().toLowerCase().max(254).refine((email) => email.endsWith("@ortmontreuil.fr"), "Utilise ton adresse de classe @ortmontreuil.fr."),
  password: z.string().min(4, "Le mot de passe doit contenir au moins 4 caractères.").max(128),
});

export const schoolEmailSchema = newUserSchema.shape.email;
export const passwordSchema = newUserSchema.shape.password;

export const loginSchema = z.object({ identifier: z.string().trim().min(3).max(254), password: z.string().min(1).max(128) });

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (!host) return origin === url.origin;

  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim().toLowerCase();
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https" ? forwardedProtocol : url.protocol.slice(0, -1);

  return origin === `${protocol}://${host}`;
}
