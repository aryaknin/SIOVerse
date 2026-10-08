import { BookOpenText, Gamepad2, MessageCircle, VenetianMask } from "lucide-react";

export const universes = [
  { slug: "lore", name: "Lore", subtitle: "Les archives cachées", description: "Dossiers classés, légendes et mystères de la promo.", icon: BookOpenText, number: "01", className: "lore" },
  { slug: "memes", name: "Mèmes", subtitle: "Le chaos du feed", description: "Les blagues que seul un étudiant SIO peut comprendre.", icon: MessageCircle, number: "02", className: "memes" },
  { slug: "undercover", name: "Undercover", subtitle: "Personne n’est innocent", description: "Une mission secrète commence ici. Gardez votre couverture.", icon: VenetianMask, number: "03", className: "undercover" },
  { slug: "makeitsio", name: "MakeItSIO", subtitle: "Créez. Votez. Riez.", description: "La soirée mèmes en mode plateau, entre amis.", icon: Gamepad2, number: "04", className: "makeitsio" },
] as const;

