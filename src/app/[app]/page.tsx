import { notFound, redirect } from "next/navigation";
import { CalendarDays, CalendarX2 } from "lucide-react";
import { AssessmentPlanner } from "@/components/assessment-planner";
import { UserManagement } from "@/components/user-management";
import { OsShell } from "@/components/os-shell";
import { ResourceExplorer } from "@/components/resource-explorer";
import { WeeklyTimetable } from "@/components/weekly-timetable";
import { readEntCatalog } from "@/lib/ent-store";
import { listUsers, requireUser } from "@/lib/auth";
import { getSchoolCalendar, parisDateKey, type SchoolCalendar } from "@/lib/school-calendar";

const appNames = ["agenda", "ressources", "controles", "utilisateurs"] as const;
type AppName = (typeof appNames)[number];

const emptyMessages: Record<Exclude<SchoolCalendar["status"], "ready">, { title: string; detail: string }> = {
  missing: { title: "Agenda non connecté", detail: "Ajoutez votre lien iCal ÉcoleDirecte dans la configuration locale du serveur." },
  "empty-feed": { title: "Le flux iCal est vide", detail: "ÉcoleDirecte répond, mais ne transmet aucun cours avec ce lien. Si des cours sont visibles dans votre compte, vérifiez ou régénérez le lien iCal." },
  "no-upcoming": { title: "Aucun cours disponible", detail: "L’agenda ne contient pour l’instant aucun cours renseigné à afficher." },
  error: { title: "Agenda indisponible", detail: "La synchronisation n’a pas abouti. Réessayez dans quelques instants." },
};

async function Agenda() {
  const calendar = await getSchoolCalendar();
  const todayKey = parisDateKey(new Date());
  const sourceLabel = calendar.source === "class" ? "EDT de la classe" : calendar.source === "personal" ? "EDT personnel" : "ÉcoleDirecte";
  const sourceNote = calendar.source === "personal" && calendar.classStatus === "empty-feed"
    ? "L’EDT de la classe est encore vide. Votre emploi du temps personnel est affiché en attendant."
    : calendar.source === "personal" && calendar.classStatus === "error"
      ? "L’EDT général de la classe est temporairement indisponible : votre EDT personnel est affiché."
      : calendar.source === "class"
        ? "L’EDT général de la classe est affiché."
        : calendar.source === "personal"
          ? "Votre EDT personnel est affiché."
          : "";

  return <div className="os-app-page agenda-page">
    <header className="app-heading agenda-heading"><div><span className="app-eyebrow"><CalendarDays size={16} /> ÉCOLEDIRECTE</span><h2>Emploi du temps<span>.</span></h2><p>Votre semaine, en un coup d’œil.</p></div><span className="agenda-source"><span />{sourceLabel}</span></header>
    {calendar.status === "ready" ? <WeeklyTimetable events={calendar.events} today={todayKey} /> : <div className="app-panel agenda-empty"><span><CalendarX2 size={29} /></span><h3>{emptyMessages[calendar.status].title}</h3><p>{emptyMessages[calendar.status].detail}</p></div>}
    <div className="app-info-note agenda-source-note"><CalendarDays size={16} /><span>{sourceNote} Horaires de Paris.</span></div>
  </div>;
}

export default async function AppPage({ params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  if (!appNames.includes(app as AppName)) notFound();
  const user = await requireUser();
  if (app === "utilisateurs") {
    if (user.role !== "ADMIN") redirect("/");
    return <OsShell active="utilisateurs" user={user}><UserManagement initialUsers={await listUsers()} currentUserId={user.id} /></OsShell>;
  }
  if (app === "agenda") return <OsShell active="agenda" user={user}><Agenda /></OsShell>;
  const catalog = await readEntCatalog();
  return <OsShell active={app as AppName} user={user}>{app === "ressources" ? <ResourceExplorer initialCatalog={catalog} canManage={user.role === "ADMIN"} userId={user.id} /> : <AssessmentPlanner initialCatalog={catalog} canManage={user.role === "ADMIN"} userId={user.id} />}</OsShell>;
}
