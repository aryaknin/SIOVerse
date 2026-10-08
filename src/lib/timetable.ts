import type { SchoolEvent } from "./calendar-parser";

const parisParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function localEventTime(value: string) {
  const parts = Object.fromEntries(parisParts.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function addCalendarDays(date: string, days: number): string {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function mondayOf(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addCalendarDays(date, -((weekday + 6) % 7));
}

export function getCalendarWeeks(events: SchoolEvent[]) {
  const weeks = new Map<string, SchoolEvent[]>();
  for (const event of events) {
    const monday = mondayOf(localEventTime(event.start).date);
    const entries = weeks.get(monday) ?? [];
    entries.push(event);
    weeks.set(monday, entries);
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([start, entries]) => ({ start, events: entries }));
}

export function closestWeekIndex(weeks: { start: string }[], today: string): number {
  const currentMonday = mondayOf(today);
  const next = weeks.findIndex((week) => week.start >= currentMonday);
  return next >= 0 ? next : Math.max(0, weeks.length - 1);
}

export type PositionedLesson = {
  event: SchoolEvent;
  start: number;
  end: number;
  column: number;
  columns: number;
};

// Each connected group of overlapping courses shares the available day width.
export function positionLessons(events: SchoolEvent[]): PositionedLesson[] {
  const lessons = events.filter((event) => !event.allDay).map((event) => {
    const start = localEventTime(event.start);
    const end = localEventTime(event.end);
    return { event, start: start.minutes, end: end.date > start.date ? 1440 : Math.max(start.minutes + 1, end.minutes), column: 0, columns: 1 };
  }).sort((a, b) => a.start - b.start || b.end - a.end);
  let group: PositionedLesson[] = [];
  let columnEnds: number[] = [];
  let groupEnd = 0;
  const finishGroup = () => group.forEach((lesson) => { lesson.columns = columnEnds.length; });

  for (const lesson of lessons) {
    if (lesson.start >= groupEnd) {
      finishGroup();
      group = [];
      columnEnds = [];
    }
    const available = columnEnds.findIndex((end) => end <= lesson.start);
    lesson.column = available === -1 ? columnEnds.length : available;
    columnEnds[lesson.column] = lesson.end;
    group.push(lesson);
    groupEnd = Math.max(...columnEnds);
  }
  finishGroup();
  return lessons;
}
