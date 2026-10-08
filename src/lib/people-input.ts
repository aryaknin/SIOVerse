import { z } from "zod";

export const personKeySchema = z.string().refine((value) => {
  const [kind, id, extra] = value.split(":");
  return !extra && (kind === "user" || kind === "person") && z.uuid().safeParse(id).success;
}, "Personne concernée invalide.");

export const concernedPeopleSchema = z.array(personKeySchema).min(1, "Sélectionne au moins une personne concernée.").max(30).refine((people) => new Set(people).size === people.length, "Une personne est sélectionnée plusieurs fois.");
