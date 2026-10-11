"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowUpRight, BookOpen, CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, FileText, MapPin, X } from "lucide-react";
import type { SchoolEvent } from "@/lib/calendar-parser";
import type { EntAssessment, EntCatalog } from "@/lib/ent";
import { resourceKindLabel } from "@/lib/ent";
import { resourcesForSchoolEvent } from "@/lib/agenda-linking";
import { addCalendarDays, closestWeekIndex, getCalendarWeeks, localEventTime, mondayOf, positionLessons } from "@/lib/timetable";

const hourHeight = 68;
const dayName = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" });
const monthDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

function dateLabel(value: string) { return monthDay.format(new Date(`${value}T12:00:00Z`)); }

function weekNumber(monday: string) {
  const thursday = new Date(`${addCalendarDays(monday, 3)}T12:00:00Z`);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1, 12));
  return Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function subjectColor(title: string) { return [...title.toLocaleLowerCase("fr")].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0) % 6; }

function lessonStatus(event: SchoolEvent) {
  if (event.status) return event.status;
  const title = event.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\bannul/.test(title) ? "cancelled" : /\bdeplace/.test(title) ? "moved" : /\bmodifie/.test(title) ? "modified" : "confirmed";
}

function courseColor(event: SchoolEvent) { return `${lessonStatus(event) === "cancelled" ? "course-cancelled" : `course-color-${subjectColor(event.title)}`} is-${lessonStatus(event)}`; }
function statusLabel(event: SchoolEvent) { return { cancelled: "ANNULÉ", moved: "DÉPLACÉ", modified: "MODIFIÉ", confirmed: "" }[lessonStatus(event)]; }
function closestDayIndex(days: string[], today: string) { const next = days.findIndex((day) => day >= today); return next >= 0 ? next : Math.max(0, days.length - 1); }

export function WeeklyTimetable({ events, today, catalog }: { events: SchoolEvent[]; today: string; catalog: EntCatalog }) {
  const weeks = useMemo(() => getCalendarWeeks(events), [events]);
  const availableDays = useMemo(() => [...new Set(events.map((event) => localEventTime(event.start).date))].sort(), [events]);
  const nearestIndex = closestWeekIndex(weeks, today);
  const nearestDayIndex = closestDayIndex(availableDays, today);
  const [view, setView] = useState<"week" | "day">("week");
  const [selectedWeek, setSelectedWeek] = useState(weeks[nearestIndex]?.start);
  const [selectedDay, setSelectedDay] = useState(availableDays[nearestDayIndex]);
  const [selectedLesson, setSelectedLesson] = useState<SchoolEvent | null>(null);
  const detail = useRef<HTMLDialogElement>(null);
  const foundIndex = weeks.findIndex((week) => week.start === selectedWeek);
  const index = foundIndex >= 0 ? foundIndex : nearestIndex;
  const dayIndex = Math.max(0, availableDays.indexOf(selectedDay));
  const week = weeks[index];
  if (!week) return null;

  const nearestWeekLabel = weeks[nearestIndex].start === mondayOf(today) ? "Cette semaine" : weeks[nearestIndex].start > mondayOf(today) ? "Prochains cours" : "Derniers cours";
  const weekDays = Array.from({ length: 7 }, (_, offset) => addCalendarDays(week.start, offset)).filter((date, offset) => offset < 5 || week.events.some((event) => localEventTime(event.start).date === date));
  const days = view === "week" ? weekDays : [availableDays[dayIndex]];
  const visibleEvents = view === "week" ? week.events : events.filter((event) => localEventTime(event.start).date === days[0]);
  const dayEvents = days.map((date) => visibleEvents.filter((event) => localEventTime(event.start).date === date));
  const positionedDays = dayEvents.map(positionLessons);
  const positioned = positionedDays.flat();
  const startHour = positioned.length ? Math.max(0, Math.min(8, Math.floor(Math.min(...positioned.map((lesson) => lesson.start)) / 60))) : 8;
  const endHour = positioned.length ? Math.min(24, Math.max(18, Math.ceil(Math.max(...positioned.map((lesson) => lesson.end)) / 60))) : 18;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, offset) => startHour + offset);
  const height = (endHour - startHour) * hourHeight;
  const hasAllDay = visibleEvents.some((event) => event.allDay);
  const assessmentDays = days.map((date) => catalog.assessments.filter((assessment) => localEventTime(assessment.scheduledAt).date === date).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
  const hasAssessments = assessmentDays.some((items) => items.length);
  const navIndex = view === "week" ? index : dayIndex;
  const navLength = view === "week" ? weeks.length : availableDays.length;
  const selectedLinks = selectedLesson ? resourcesForSchoolEvent(selectedLesson, catalog) : { resources: [] };
  const selectedAssessments = selectedLesson && selectedLinks.subject ? catalog.assessments.filter((assessment) => assessment.subjectId === selectedLinks.subject?.id && localEventTime(assessment.scheduledAt).date === localEventTime(selectedLesson.start).date) : [];

  function navigate(offset: number) {
    if (view === "week") setSelectedWeek(weeks[index + offset].start);
    else setSelectedDay(availableDays[dayIndex + offset]);
  }

  function jumpToNearest() {
    if (view === "week") setSelectedWeek(weeks[nearestIndex].start);
    else setSelectedDay(availableDays[nearestDayIndex]);
  }

  function changeView(next: "week" | "day") {
    if (next === "day") setSelectedDay(availableDays.includes(today) ? today : availableDays.find((day) => mondayOf(day) === week.start) ?? availableDays[nearestDayIndex]);
    else setSelectedWeek(mondayOf(availableDays[dayIndex] ?? today));
    setView(next);
  }

  return <section className={`timetable ${view === "day" ? "is-day-view" : ""}`} aria-label={view === "week" ? "Emploi du temps hebdomadaire" : "Emploi du temps journalier"}>
    <div className="timetable-toolbar">
      <div className="timetable-period" aria-live="polite" aria-atomic="true"><span className="timetable-week-label">{view === "week" ? `SEMAINE ${weekNumber(week.start)}` : dayName.format(new Date(`${days[0]}T12:00:00Z`)).replace(".", "").toUpperCase()} <span>· {visibleEvents.length} cours</span></span><h3>{view === "week" ? <>{dateLabel(week.start)} <span>—</span> {dateLabel(addCalendarDays(week.start, 6))} <small>{week.start.slice(0, 4)}</small></> : <>{dateLabel(days[0])} <small>{days[0].slice(0, 4)}</small></>}</h3></div>
      <div className="timetable-navigation"><div className="timetable-view-toggle" aria-label="Mode d’affichage"><button type="button" className={view === "week" ? "active" : ""} onClick={() => changeView("week")}>Semaine</button><button type="button" className={view === "day" ? "active" : ""} onClick={() => changeView("day")}>Journée</button></div><button type="button" className="timetable-today" disabled={view === "week" ? index === nearestIndex : dayIndex === nearestDayIndex} onClick={jumpToNearest}>{view === "week" ? nearestWeekLabel : availableDays[nearestDayIndex] === today ? "Aujourd’hui" : "Jour le plus proche"}</button><div className="timetable-arrows"><button type="button" aria-label={view === "week" ? "Semaine précédente" : "Jour précédent"} disabled={navIndex === 0} onClick={() => navigate(-1)}><ChevronLeft size={18} /></button><span>{navIndex + 1}<span> / {navLength}</span></span><button type="button" aria-label={view === "week" ? "Semaine suivante" : "Jour suivant"} disabled={navIndex === navLength - 1} onClick={() => navigate(1)}><ChevronRight size={18} /></button></div></div>
    </div>

    <div className="timetable-scroll" tabIndex={0} role="region" aria-label="Grille des cours, défilement horizontal disponible"><div className="timetable-grid" style={{ gridTemplateColumns: `54px repeat(${days.length}, minmax(${view === "day" ? "440px" : "148px"}, 1fr))` }}>
      <div className="timetable-corner"><Clock3 size={15} /></div>{days.map((date) => <div className={`timetable-day-heading ${date === today ? "is-today" : ""}`} key={date}><span>{dayName.format(new Date(`${date}T12:00:00Z`)).replace(".", "")}</span><strong>{Number(date.slice(-2))}</strong>{date === today && <i aria-label="Aujourd’hui" />}</div>)}
      {hasAssessments && <><div className="timetable-all-day-label assessment-label">À préparer</div>{assessmentDays.map((items, currentDay) => <div className="timetable-assessment-day" key={days[currentDay]}>{items.map((assessment) => <AssessmentChip assessment={assessment} catalog={catalog} key={assessment.id} />)}</div>)}</>}
      {hasAllDay && <><div className="timetable-all-day-label">Journée</div>{dayEvents.map((entries, currentDay) => <div className="timetable-all-day" key={days[currentDay]}>{entries.filter((event) => event.allDay).map((event) => <button type="button" key={event.id} className={`timetable-all-day-course ${courseColor(event)}`} onClick={() => { setSelectedLesson(event); detail.current?.showModal(); }}>{statusLabel(event) && <b>{statusLabel(event)}</b>}{event.title}</button>)}</div>)}</>}
      <div className="timetable-hours" style={{ height }} aria-hidden="true">{hours.map((hour) => <span key={hour} style={{ top: (hour - startHour) * hourHeight }}>{String(hour).padStart(2, "0")}:00</span>)}</div>
      {positionedDays.map((lessons, currentDay) => <div key={days[currentDay]} className={`timetable-day-track ${days[currentDay] === today ? "is-today" : ""}`} style={{ height }} aria-label={fullDate.format(new Date(`${days[currentDay]}T12:00:00Z`))}>{lessons.map(({ event, start, end, column, columns }) => <button type="button" className={`timetable-course ${courseColor(event)} ${end - start < 60 ? "is-short" : ""}`} key={event.id} onClick={() => { setSelectedLesson(event); detail.current?.showModal(); }} aria-label={`${statusLabel(event) ? `${statusLabel(event)}, ` : ""}${event.title}, ${time.format(new Date(event.start))} à ${time.format(new Date(event.end))}${event.location ? `, ${event.location}` : ""}`} style={{ top: (start - startHour * 60) / 60 * hourHeight + 2, height: Math.max(16, (end - start) / 60 * hourHeight - 4), left: `calc(${column / columns * 100}% + 4px)`, width: `calc(${100 / columns}% - 8px)` }}><span className="timetable-course-time">{time.format(new Date(event.start))} <span>–</span> {time.format(new Date(event.end))}</span>{statusLabel(event) && <span className={`timetable-course-status ${lessonStatus(event)}`}>{statusLabel(event)}</span>}<strong>{event.title}</strong>{event.location && <span className="timetable-course-room"><MapPin size={11} />{event.location}</span>}</button>)}</div>)}
    </div></div>

    <div className="timetable-footer"><span><span className="timetable-status-dot" /> {weeks.length} semaine{weeks.length > 1 ? "s" : ""} avec cours</span><span className="timetable-legend"><i className="moved" /> Déplacé <i className="modified" /> Modifié <i className="cancelled" /> Annulé</span><span>Les périodes vides sont masquées.</span></div>

    <dialog ref={detail} className="timetable-detail" aria-labelledby="lesson-detail-title"><form method="dialog"><button className="timetable-detail-close" aria-label="Fermer les détails du cours"><X size={18} /></button></form>{selectedLesson && <><div className="timetable-detail-top"><span className={`timetable-detail-icon ${courseColor(selectedLesson)}`}><CalendarDays size={23} /></span>{statusLabel(selectedLesson) && <span className={`timetable-detail-status ${lessonStatus(selectedLesson)}`}>{statusLabel(selectedLesson)}</span>}</div><p className="timetable-detail-date">{fullDate.format(new Date(selectedLesson.start))}</p><h3 id="lesson-detail-title">{selectedLesson.title}</h3><p><Clock3 size={16} />{selectedLesson.allDay ? "Toute la journée" : `${time.format(new Date(selectedLesson.start))} – ${time.format(new Date(selectedLesson.end))}`}</p>{selectedLesson.location && <p><MapPin size={16} />{selectedLesson.location}</p>}{selectedLinks.subject && <div className="timetable-linked"><div><BookOpen size={16} /><span><small>MATIÈRE ASSOCIÉE</small><strong>{selectedLinks.subject.name}</strong></span></div><Link href="/ressources">Ouvrir la bibliothèque <ArrowUpRight size={13} /></Link></div>}{selectedLinks.resources.length > 0 && <div className="timetable-detail-resources"><div className="timetable-detail-section"><span>RESSOURCES DISPONIBLES</span><strong>{selectedLinks.resources.length}</strong></div>{selectedLinks.resources.slice(0, 4).map((resource) => <a key={resource.id} href={resource.externalUrl ?? `/api/ent/files/${resource.id}`} target="_blank" rel="noopener noreferrer"><FileText size={14} /><span>{resource.title}<small>{resourceKindLabel(resource.kind)}</small></span><ArrowUpRight size={13} /></a>)}</div>}{selectedAssessments.length > 0 && <Link href="/controles" className="timetable-detail-assessment"><ClipboardCheck size={16} /><span><small>{selectedAssessments[0].kind === "CONTROL" ? "CONTRÔLE CE JOUR" : "TRAVAIL À RENDRE"}</small><strong>{selectedAssessments[0].title}</strong></span><ArrowUpRight size={14} /></Link>}</>}</dialog>
  </section>;
}

function AssessmentChip({ assessment, catalog }: { assessment: EntAssessment; catalog: EntCatalog }) {
  const subject = catalog.subjects.find((item) => item.id === assessment.subjectId);
  return <Link href="/controles" className={`timetable-assessment course-color-${subjectColor(subject?.name ?? assessment.title)}`} title={`${assessment.kind === "CONTROL" ? "Contrôle" : "Devoir"} : ${assessment.title}`}><ClipboardCheck size={12} /><span><strong>{assessment.title}</strong><small>{time.format(new Date(assessment.scheduledAt))} · {subject?.name ?? "Échéance"}</small></span></Link>;
}
