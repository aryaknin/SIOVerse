import "server-only";

import { parseCalendar, selectCalendar, type SchoolCalendar, type SourcedSchoolCalendar } from "./calendar-parser";

export { parisDateKey, type SchoolCalendar } from "./calendar-parser";

const refreshSeconds = 15 * 60;
const maxCalendarSize = 5 * 1024 * 1024;

async function fetchCalendar(configuredUrl: string): Promise<SchoolCalendar> {
  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "https:" || url.hostname !== "api.ecoledirecte.com") {
      return { status: "error", events: [] };
    }

    const response = await fetch(url, {
      headers: { Accept: "text/calendar" },
      next: { revalidate: refreshSeconds },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { status: "error", events: [] };

    const body = await response.text();
    if (body.length > maxCalendarSize) return { status: "error", events: [] };
    return await parseCalendar(body, new Date());
  } catch {
    // Do not log the URL: it contains the private calendar token.
    return { status: "error", events: [] };
  }
}

export async function getSchoolCalendar(): Promise<SourcedSchoolCalendar> {
  const classUrl = process.env.ECOLEDIRECTE_CLASS_ICAL_URL;
  const personalUrl = process.env.ECOLEDIRECTE_ICAL_URL;
  if (!classUrl && !personalUrl) return selectCalendar();

  const classCalendar = classUrl ? await fetchCalendar(classUrl) : undefined;
  if (classCalendar?.status === "ready") return selectCalendar(classCalendar);

  const personalCalendar = personalUrl ? await fetchCalendar(personalUrl) : undefined;
  return selectCalendar(classCalendar, personalCalendar);
}
