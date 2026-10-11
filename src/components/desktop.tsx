import { OsShell } from "./os-shell";
import { getSchoolCalendar } from "@/lib/school-calendar";
import type { SessionUser } from "@/lib/auth";
import { readEntCatalog } from "@/lib/ent-store";

export async function Desktop({ user }: { user: SessionUser }) {
  const [calendar, catalog] = await Promise.all([getSchoolCalendar(), readEntCatalog()]);
  return <OsShell user={user} desktopCatalog={catalog} desktopCourses={calendar.status === "ready" ? calendar.events.filter((event) => !event.allDay) : []} />;
}
