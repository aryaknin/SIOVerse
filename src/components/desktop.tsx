import { OsShell } from "./os-shell";
import { getSchoolCalendar } from "@/lib/school-calendar";
import type { SessionUser } from "@/lib/auth";

export async function Desktop({ user }: { user: SessionUser }) {
  const calendar = await getSchoolCalendar();
  return <OsShell user={user} desktopCourses={calendar.status === "ready" ? calendar.events.filter((event) => !event.allDay) : []} />;
}
