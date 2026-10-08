"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, X } from "lucide-react";
import type { SchoolEvent } from "@/lib/calendar-parser";
import { addCalendarDays, closestWeekIndex, getCalendarWeeks, localEventTime, mondayOf, positionLessons } from "@/lib/timetable";

const hourHeight = 68;
const dayName = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" });
const monthDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

function dateLabel(value: string) {
  return monthDay.format(new Date(`${value}T12:00:00Z`));
}

function weekNumber(monday: string) {
  const thursday = new Date(`${addCalendarDays(monday, 3)}T12:00:00Z`);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1, 12));
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function subjectColor(title: string) {
  return [...title.toLocaleLowerCase("fr")].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0) % 6;
}

function courseColor(title: string) {
  return /^annul[ée]/i.test(title) ? "course-cancelled" : `course-color-${subjectColor(title)}`;
}

export function WeeklyTimetable({ events, today }: { events: SchoolEvent[]; today: string }) {
  const weeks = useMemo(() => getCalendarWeeks(events), [events]);
  const nearestIndex = closestWeekIndex(weeks, today);
  const [selectedWeek, setSelectedWeek] = useState(weeks[nearestIndex]?.start);
  const [selectedLesson, setSelectedLesson] = useState<SchoolEvent | null>(null);
  const detail = useRef<HTMLDialogElement>(null);
  const foundIndex = weeks.findIndex((week) => week.start === selectedWeek);
  const index = foundIndex >= 0 ? foundIndex : nearestIndex;
  const week = weeks[index];
  if (!week) return null;
  const nearestWeekLabel = weeks[nearestIndex].start === mondayOf(today)
    ? "Cette semaine"
    : weeks[nearestIndex].start > mondayOf(today) ? "Prochains cours" : "Derniers cours";

  const days = Array.from({ length: 7 }, (_, offset) => addCalendarDays(week.start, offset))
    .filter((date, offset) => offset < 5 || week.events.some((event) => localEventTime(event.start).date === date));
  const dayEvents = days.map((date) => week.events.filter((event) => localEventTime(event.start).date === date));
  const positionedDays = dayEvents.map(positionLessons);
  const positioned = positionedDays.flat();
  const startHour = Math.max(0, Math.min(8, Math.floor(Math.min(...positioned.map((lesson) => lesson.start)) / 60)));
  const endHour = Math.min(24, Math.max(18, Math.ceil(Math.max(...positioned.map((lesson) => lesson.end)) / 60)));
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, offset) => startHour + offset);
  const height = (endHour - startHour) * hourHeight;
  const hasAllDay = week.events.some((event) => event.allDay);
  const openLesson = (event: SchoolEvent) => {
    setSelectedLesson(event);
    detail.current?.showModal();
  };

  return (
    <section className="timetable" aria-label="Emploi du temps hebdomadaire">
      <div className="timetable-toolbar">
        <div className="timetable-period" aria-live="polite" aria-atomic="true">
          <span className="timetable-week-label">SEMAINE {weekNumber(week.start)} <span>· {week.events.length} cours</span></span>
          <h3>{dateLabel(week.start)} <span>—</span> {dateLabel(addCalendarDays(week.start, 6))} <small>{week.start.slice(0, 4)}</small></h3>
        </div>
        <div className="timetable-navigation">
          <button type="button" className="timetable-today" disabled={index === nearestIndex} onClick={() => setSelectedWeek(weeks[nearestIndex].start)}>
            {nearestWeekLabel}
          </button>
          <div className="timetable-arrows">
            <button type="button" aria-label="Semaine précédente" disabled={index === 0} onClick={() => setSelectedWeek(weeks[index - 1].start)}><ChevronLeft size={18} /></button>
            <span>{index + 1}<span> / {weeks.length}</span></span>
            <button type="button" aria-label="Semaine suivante" disabled={index === weeks.length - 1} onClick={() => setSelectedWeek(weeks[index + 1].start)}><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>

      <div className="timetable-scroll" tabIndex={0} role="region" aria-label="Grille des cours, défilement horizontal disponible">
        <div className="timetable-grid" style={{ gridTemplateColumns: `54px repeat(${days.length}, minmax(148px, 1fr))` }}>
          <div className="timetable-corner"><Clock3 size={15} /></div>
          {days.map((date) => <div className={`timetable-day-heading ${date === today ? "is-today" : ""}`} key={date}>
            <span>{dayName.format(new Date(`${date}T12:00:00Z`)).replace(".", "")}</span>
            <strong>{Number(date.slice(-2))}</strong>
            {date === today && <i aria-label="Aujourd’hui" />}
          </div>)}

          {hasAllDay && <>
            <div className="timetable-all-day-label">Journée</div>
            {dayEvents.map((entries, dayIndex) => <div className="timetable-all-day" key={days[dayIndex]}>{entries.filter((event) => event.allDay).map((event) => <button type="button" key={event.id} className={`timetable-all-day-course ${courseColor(event.title)}`} onClick={() => openLesson(event)}>{event.title}</button>)}</div>)}
          </>}

          <div className="timetable-hours" style={{ height }} aria-hidden="true">
            {hours.map((hour) => <span key={hour} style={{ top: (hour - startHour) * hourHeight }}>{String(hour).padStart(2, "0")}:00</span>)}
          </div>
          {positionedDays.map((lessons, dayIndex) => <div key={days[dayIndex]} className={`timetable-day-track ${days[dayIndex] === today ? "is-today" : ""}`} style={{ height }} aria-label={fullDate.format(new Date(`${days[dayIndex]}T12:00:00Z`))}>
            {lessons.map(({ event, start, end, column, columns }) => <button
              type="button"
              className={`timetable-course ${courseColor(event.title)} ${end - start < 60 ? "is-short" : ""}`}
              key={event.id}
              onClick={() => openLesson(event)}
              aria-label={`${event.title}, ${time.format(new Date(event.start))} à ${time.format(new Date(event.end))}${event.location ? `, ${event.location}` : ""}`}
              style={{ top: (start - startHour * 60) / 60 * hourHeight + 2, height: Math.max(16, (end - start) / 60 * hourHeight - 4), left: `calc(${column / columns * 100}% + 4px)`, width: `calc(${100 / columns}% - 8px)` }}
            >
              <span className="timetable-course-time">{time.format(new Date(event.start))} <span>–</span> {time.format(new Date(event.end))}</span>
              <strong>{event.title}</strong>
              {event.location && <span className="timetable-course-room"><MapPin size={11} />{event.location}</span>}
            </button>)}
          </div>)}
        </div>
      </div>

      <div className="timetable-footer"><span><span className="timetable-status-dot" /> {weeks.length} semaine{weeks.length > 1 ? "s" : ""} avec cours</span><span>Les semaines vides sont masquées.</span></div>

      <dialog ref={detail} className="timetable-detail" aria-labelledby="lesson-detail-title">
        <form method="dialog"><button className="timetable-detail-close" aria-label="Fermer les détails du cours"><X size={18} /></button></form>
        {selectedLesson && <>
          <span className={`timetable-detail-icon ${courseColor(selectedLesson.title)}`}><CalendarDays size={23} /></span>
          <p className="timetable-detail-date">{fullDate.format(new Date(selectedLesson.start))}</p>
          <h3 id="lesson-detail-title">{selectedLesson.title}</h3>
          <p><Clock3 size={16} />{selectedLesson.allDay ? "Toute la journée" : `${time.format(new Date(selectedLesson.start))} – ${time.format(new Date(selectedLesson.end))}`}</p>
          {selectedLesson.location && <p><MapPin size={16} />{selectedLesson.location}</p>}
        </>}
      </dialog>
    </section>
  );
}
