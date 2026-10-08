import ical, { type ParameterValue, type VEvent } from "node-ical";

const calendarTimeZone = "Europe/Paris";
const dayMilliseconds = 24 * 60 * 60 * 1000;
// A feed may contain unbounded RRULEs. Expand those only one year ahead and
// cap every series at 5,000 occurrences; ordinary dated events are never clipped.
const unboundedRecurrenceDays = 366;
const maxRecurrenceOccurrences = 5_000;

export type SchoolEvent = {
  id: string;
  title: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
};

export type SchoolCalendar = {
  status: "missing" | "ready" | "empty-feed" | "no-upcoming" | "error";
  events: SchoolEvent[];
};

export type SourcedSchoolCalendar = SchoolCalendar & {
  source: "class" | "personal" | null;
  classStatus?: SchoolCalendar["status"];
};

export function selectCalendar(classCalendar?: SchoolCalendar, personalCalendar?: SchoolCalendar): SourcedSchoolCalendar {
  if (classCalendar?.status === "ready") {
    return { ...classCalendar, source: "class", classStatus: "ready" };
  }
  if (personalCalendar?.status === "ready") {
    return { ...personalCalendar, source: "personal", classStatus: classCalendar?.status };
  }

  const fallback = personalCalendar?.status === "error"
    ? classCalendar ?? personalCalendar
    : personalCalendar ?? classCalendar;
  return { ...(fallback ?? { status: "missing", events: [] }), source: null, classStatus: classCalendar?.status };
}

const parisDate = new Intl.DateTimeFormat("en-US", {
  timeZone: calendarTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function parisDateKey(date: Date): string {
  const parts = Object.fromEntries(parisDate.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function calendarText(value?: ParameterValue): string {
  if (!value) return "";
  return typeof value === "string" ? value : value.val;
}

function recurrenceRange(event: VEvent, now: Date): { from: Date; to: Date } | null {
  if (!event.rrule) return null;
  const { count, until } = event.rrule.options;
  const bounded = count != null || until != null;
  const safetyEnd = new Date(now.getTime() + unboundedRecurrenceDays * dayMilliseconds);
  let capped = false;
  const dates = event.rrule.all((date, index) => {
    if (index >= maxRecurrenceOccurrences) {
      capped = true;
      return false;
    }
    return bounded || date <= safetyEnd;
  });
  if (!dates.length) return null;
  const lastExpanded = dates[dates.length - 1];

  // A moved occurrence may sit outside the original series' dates. Include it
  // without extending an unbounded recurrence beyond its safety horizon.
  const overrides = Object.values(event.recurrences ?? {}).flatMap((override) => (
    override.start instanceof Date && !Number.isNaN(override.start.getTime())
      && (bounded || override.start <= safetyEnd)
      && (!capped || override.start <= lastExpanded) ? [override.start] : []
  ));
  const timestamps = [...dates, ...overrides].map((date) => date.getTime());
  return { from: new Date(Math.min(...timestamps)), to: new Date(Math.max(...timestamps)) };
}

function eventOccurrences(event: VEvent, now: Date): SchoolEvent[] {
  if (!(event.start instanceof Date) || Number.isNaN(event.start.getTime())) return [];
  const range = recurrenceRange(event, now);
  if (event.rrule && !range) return [];
  const instances = event.rrule && range
    ? ical.expandRecurringEvent(event, { ...range, expandOngoing: true })
    : [{ start: event.start, end: event.end ?? event.start, summary: event.summary, isFullDay: event.datetype === "date", event }];

  return instances.flatMap((instance) => {
    if (instance.event.status === "CANCELLED") return [];
    const title = calendarText(instance.summary).trim();
    if (!title) return [];
    const start = instance.start;
    const end = instance.end;
    if (!(start instanceof Date) || Number.isNaN(start.getTime())) return [];
    const safeEnd = end instanceof Date && !Number.isNaN(end.getTime()) ? end : start;
    return [{
      id: `${event.uid}-${start.toISOString()}`,
      title,
      location: calendarText(instance.event.location).trim(),
      start: start.toISOString(),
      end: safeEnd.toISOString(),
      allDay: instance.isFullDay,
    }];
  });
}

export async function parseCalendar(body: string, now: Date): Promise<SchoolCalendar> {
  if (!body.includes("BEGIN:VCALENDAR")) return { status: "error", events: [] };

  const calendar = await ical.async.parseICS(body);
  const sourceEvents = Object.values(calendar).filter((item): item is VEvent => item?.type === "VEVENT");
  if (sourceEvents.length === 0) return { status: "empty-feed", events: [] };

  const unique = new Map<string, SchoolEvent>();

  for (const event of sourceEvents) {
    for (const occurrence of eventOccurrences(event, now)) {
      unique.set(occurrence.id, occurrence);
    }
  }

  const events = [...unique.values()].sort((a, b) => a.start.localeCompare(b.start));
  return { status: events.length ? "ready" : "no-upcoming", events };
}
