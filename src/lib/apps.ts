import { BookOpen, CalendarDays, ClipboardCheck, Orbit, UsersRound } from "lucide-react";

export const apps = [
  { slug: "agenda", label: "Agenda", eyebrow: "Planning", icon: CalendarDays, color: "violet" },
  { slug: "ressources", label: "Ressources", eyebrow: "Cours & docs", icon: BookOpen, color: "blue" },
  { slug: "controles", label: "Contrôles", eyebrow: "Révision express", icon: ClipboardCheck, color: "orange" },
  { slug: "utilisateurs", label: "Utilisateurs", eyebrow: "Administration", icon: UsersRound, color: "violet", adminOnly: true },
  { slug: "sioverse", label: "SIOVerse.exe", eyebrow: "Communauté", icon: Orbit, color: "green" },
] as const;

export type AppSlug = (typeof apps)[number]["slug"];
