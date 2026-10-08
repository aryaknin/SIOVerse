import assert from "node:assert/strict";
import test from "node:test";
import { closestWeekIndex, getCalendarWeeks, localEventTime, mondayOf, positionLessons } from "../src/lib/timetable.ts";

const lesson = (id, start, end) => ({ id, title: "Cours", start, end, location: "", allDay: false });

test("la navigation ne contient que les semaines publiées et suit les dates de Paris", () => {
  const weeks = getCalendarWeeks([
    lesson("next", "2026-11-02T09:00:00Z", "2026-11-02T10:00:00Z"),
    lesson("first", "2026-10-07T08:00:00Z", "2026-10-07T09:00:00Z"),
    lesson("second", "2026-10-12T08:00:00Z", "2026-10-12T09:00:00Z"),
  ]);
  assert.deepEqual(weeks.map((week) => week.start), ["2026-10-05", "2026-10-12", "2026-11-02"]);
  assert.equal(closestWeekIndex(weeks, "2026-10-07"), 0);
  assert.equal(closestWeekIndex(weeks, "2026-10-26"), 2);
  assert.equal(closestWeekIndex(weeks, "2027-01-01"), 2);
  assert.deepEqual(localEventTime("2026-10-25T23:30:00Z"), { date: "2026-10-26", minutes: 30 });
  assert.equal(mondayOf("2027-01-01"), "2026-12-28");
});

test("les cours simultanés partagent la colonne sans recouvrir les cours suivants", () => {
  const placed = positionLessons([
    lesson("a", "2026-10-07T08:00:00Z", "2026-10-07T10:00:00Z"),
    lesson("b", "2026-10-07T08:30:00Z", "2026-10-07T09:00:00Z"),
    lesson("c", "2026-10-07T09:00:00Z", "2026-10-07T10:00:00Z"),
    lesson("d", "2026-10-07T10:00:00Z", "2026-10-07T11:00:00Z"),
  ]);
  assert.deepEqual(placed.map(({ event, column, columns }) => [event.id, column, columns]), [
    ["a", 0, 2], ["b", 1, 2], ["c", 1, 2], ["d", 0, 1],
  ]);
});
