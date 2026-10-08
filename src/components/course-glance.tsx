"use client";

import Link from "next/link";
import { ArrowUpRight, Clock3, MapPin } from "lucide-react";
import { useEffect, useState } from "react";

type GlanceCourse = { id: string; title: string; location: string; start: string; end: string };
const timeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const dateFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });

export function CourseGlance({ courses }: { courses: GlanceCourse[] }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const first = window.setTimeout(() => setNow(new Date()), 0);
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => { window.clearTimeout(first); window.clearInterval(interval); };
  }, []);

  if (!now || !courses.length) return null;
  const current = courses.find((course) => new Date(course.start) <= now && new Date(course.end) > now);
  const next = courses.find((course) => new Date(course.start) > now);
  const shown = current ?? next;
  if (!shown) return null;

  return <Link href="/agenda" className="course-glance">
    <span className="course-glance-top"><span className={current ? "course-glance-live" : ""}><Clock3 size={13} />{current ? "EN COURS" : "PROCHAIN COURS"}</span><ArrowUpRight size={15} /></span>
    <strong>{shown.title}</strong>
    <span className="course-glance-details">{!current && <span>{dateFormat.format(new Date(shown.start))} · </span>}{timeFormat.format(new Date(shown.start))} – {timeFormat.format(new Date(shown.end))}{shown.location && <span className="course-glance-room"><MapPin size={12} /> {shown.location}</span>}</span>
    {current && next && <span className="course-glance-next">Ensuite : {next.title} à {timeFormat.format(new Date(next.start))}</span>}
  </Link>;
}
