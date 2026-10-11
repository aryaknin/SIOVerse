"use client";

import Link from "next/link";
import { ArrowUpRight, BookOpen, Clock3, FileText, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import type { EntCatalog } from "@/lib/ent";
import { resourcesForSchoolEvent } from "@/lib/agenda-linking";

type GlanceCourse = { id: string; title: string; location: string; start: string; end: string; status?: "confirmed" | "cancelled" | "moved" | "modified" };
const timeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const dateFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });

function relativeTime(milliseconds: number) {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h${minutes % 60 ? ` ${minutes % 60}` : ""}`;
}

export function CourseGlance({ courses, catalog }: { courses: GlanceCourse[]; catalog?: EntCatalog }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const first = window.setTimeout(() => setNow(new Date()), 0);
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => { window.clearTimeout(first); window.clearInterval(interval); };
  }, []);

  if (!now || !courses.length) return null;
  const activeCourses = courses.filter((course) => course.status !== "cancelled");
  const current = activeCourses.find((course) => new Date(course.start) <= now && new Date(course.end) > now);
  const next = activeCourses.find((course) => new Date(course.start) > now);
  const shown = current ?? next;
  if (!shown) return null;
  const linked = catalog ? resourcesForSchoolEvent(shown, catalog) : { resources: [] };
  const start = new Date(shown.start).getTime();
  const end = new Date(shown.end).getTime();
  const progress = current ? Math.min(100, Math.max(0, (now.getTime() - start) / Math.max(1, end - start) * 100)) : 0;
  const nextAssessment = catalog?.assessments.filter((assessment) => new Date(assessment.scheduledAt) >= now).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  const nextAssessmentSubject = catalog?.subjects.find((subject) => subject.id === nextAssessment?.subjectId);

  return <Link href="/agenda" className="course-glance">
    <span className="course-glance-top"><span className={current ? "course-glance-live" : ""}><Clock3 size={13} />{current ? `EN COURS · ENCORE ${relativeTime(end - now.getTime())}` : `DANS ${relativeTime(start - now.getTime())}`}</span><ArrowUpRight size={15} /></span>
    <strong>{shown.title}</strong>
    {linked.subject && <span className="course-glance-subject"><BookOpen size={12} /> {linked.subject.name}</span>}
    <span className="course-glance-details">{!current && <span>{dateFormat.format(new Date(shown.start))} · </span>}{timeFormat.format(new Date(shown.start))} – {timeFormat.format(new Date(shown.end))}{shown.location && <span className="course-glance-room"><MapPin size={12} /> {shown.location}</span>}</span>
    {current && <span className="course-glance-progress"><i style={{ width: `${progress}%` }} /></span>}
    <span className="course-glance-stats"><span><Clock3 size={11} /> {relativeTime(end - start)}</span>{linked.resources.length > 0 && <span><FileText size={11} /> {linked.resources.length} ressource{linked.resources.length > 1 ? "s" : ""}</span>}</span>
    {current && next && <span className="course-glance-next">Ensuite : {next.title} à {timeFormat.format(new Date(next.start))}</span>}
    {nextAssessment && <span className="course-glance-assessment">À préparer : {nextAssessment.title} · {nextAssessmentSubject?.name}</span>}
  </Link>;
}
