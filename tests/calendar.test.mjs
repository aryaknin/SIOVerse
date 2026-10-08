import assert from "node:assert/strict";
import test from "node:test";
import { parseCalendar, parisDateKey, selectCalendar } from "../src/lib/calendar-parser.ts";

const now = new Date("2026-10-07T12:00:00Z");

function calendarWith(...events) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flatMap((event) => ["BEGIN:VEVENT", ...event, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
}

test("un flux iCal vide est reconnu sans inventer de cours", async () => {
  const calendar = await parseCalendar("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR", now);
  assert.deepEqual(calendar, { status: "empty-feed", events: [] });
});

test("l’EDT général est prioritaire, avec retour sur l’EDT personnel quand il est vide", () => {
  const lesson = { id: "1", title: "Cours", location: "", start: now.toISOString(), end: now.toISOString(), allDay: false };
  const classCalendar = { status: "ready", events: [lesson] };
  const personalCalendar = { status: "ready", events: [{ ...lesson, id: "2" }] };

  assert.equal(selectCalendar(classCalendar, personalCalendar).source, "class");
  assert.equal(selectCalendar({ status: "empty-feed", events: [] }, personalCalendar).source, "personal");
  assert.equal(selectCalendar({ status: "no-upcoming", events: [] }, personalCalendar).source, "personal");
  assert.deepEqual(selectCalendar(), { status: "missing", events: [], source: null, classStatus: undefined });
});

test("les cours sont datés en heure de Paris et les exceptions de récurrence sont respectées", async () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SIOVerse Tests//FR",
    "BEGIN:VEVENT",
    "UID:lesson-1",
    "DTSTAMP:20261001T000000Z",
    "DTSTART;TZID=Europe/Paris:20261007T100000",
    "DTEND;TZID=Europe/Paris:20261007T110000",
    "SUMMARY:Cybersécurité",
    "LOCATION:B204",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:lesson-2",
    "DTSTAMP:20261001T000000Z",
    "DTSTART;TZID=Europe/Paris:20261007T150000",
    "DTEND;TZID=Europe/Paris:20261007T160000",
    "RRULE:FREQ=DAILY;COUNT=3",
    "EXDATE;TZID=Europe/Paris:20261008T150000",
    "SUMMARY:Atelier professionnel",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const calendar = await parseCalendar(ics, now);
  assert.equal(calendar.status, "ready");
  assert.equal(calendar.events.length, 3);
  assert.deepEqual(calendar.events.map((event) => event.start), [
    "2026-10-07T08:00:00.000Z",
    "2026-10-07T13:00:00.000Z",
    "2026-10-09T13:00:00.000Z",
  ]);
  assert.equal(calendar.events[0].location, "B204");
  assert.equal(parisDateKey(new Date(calendar.events[0].start)), "2026-10-07");
});

test("toutes les dates publiées restent navigables, y compris le début de semaine et les cours au-delà de 21 jours", async () => {
  const calendar = await parseCalendar(calendarWith(
    ["UID:later", "DTSTART:20270107T090000Z", "DTEND:20270107T100000Z", "SUMMARY:Mathématiques"],
    ["UID:monday", "DTSTART:20261005T090000Z", "DTEND:20261005T100000Z", "SUMMARY:Économie"],
    ["UID:previous-week", "DTSTART:20260928T090000Z", "DTEND:20260928T100000Z", "SUMMARY:Anglais"],
  ), now);

  assert.equal(calendar.status, "ready");
  assert.deepEqual(calendar.events.map((event) => event.start.slice(0, 10)), ["2026-09-28", "2026-10-05", "2027-01-07"]);
});

test("les blocs sans intitulé et les cours annulés ne créent pas de fausses semaines", async () => {
  const emptyEvents = [
    ["UID:missing-title", "DTSTART:20261102T090000Z", "DTEND:20261102T100000Z"],
    ["UID:blank-title", "DTSTART:20261109T090000Z", "DTEND:20261109T100000Z", "SUMMARY:   "],
    ["UID:cancelled", "DTSTART:20261116T090000Z", "DTEND:20261116T100000Z", "SUMMARY:Anglais", "STATUS:CANCELLED"],
  ];
  const calendar = await parseCalendar(calendarWith(
    ["UID:lesson", "DTSTART:20261007T090000Z", "DTEND:20261007T100000Z", "SUMMARY:  Cybersécurité  "],
    ...emptyEvents,
  ), now);

  assert.deepEqual(calendar.events.map((event) => event.title), ["Cybersécurité"]);
  assert.deepEqual(await parseCalendar(calendarWith(...emptyEvents), now), { status: "no-upcoming", events: [] });
});

test("une série bornée conserve ses cours éloignés et retire ses occurrences annulées", async () => {
  const calendar = await parseCalendar(calendarWith(
    ["UID:weekly", "DTSTART;TZID=Europe/Paris:20261005T100000", "DTEND;TZID=Europe/Paris:20261005T110000", "RRULE:FREQ=WEEKLY;COUNT=60", "SUMMARY:Atelier"],
    ["UID:weekly", "RECURRENCE-ID;TZID=Europe/Paris:20261012T100000", "DTSTART;TZID=Europe/Paris:20261012T100000", "DTEND;TZID=Europe/Paris:20261012T110000", "SUMMARY:Atelier", "STATUS:CANCELLED"],
  ), now);

  assert.equal(calendar.events.length, 59);
  assert.equal(calendar.events[0].start, "2026-10-05T08:00:00.000Z");
  assert.equal(calendar.events.at(-1).start, "2027-11-22T09:00:00.000Z");
  assert.ok(calendar.events.every((event) => event.start.slice(0, 10) !== "2026-10-12"));
});

test("une récurrence sans fin est limitée à un an de prévision", async () => {
  const calendar = await parseCalendar(calendarWith(
    ["UID:unbounded", "DTSTART:20261005T090000Z", "DTEND:20261005T100000Z", "RRULE:FREQ=WEEKLY", "SUMMARY:Réseaux"],
  ), now);

  assert.equal(calendar.events.length, 53);
  assert.equal(calendar.events[0].start, "2026-10-05T09:00:00.000Z");
  assert.equal(calendar.events.at(-1).start, "2027-10-04T09:00:00.000Z");
});
