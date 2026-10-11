import type { SchoolEvent } from "./calendar-parser";
import type { EntCatalog, EntResource, EntSubject } from "./ent";

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const subjectMatchers = [
  { subject: /\bjava\b/, course: /\b(java|programmation objet|poo)\b/ },
  { subject: /\b(bdd|base.*donnee)/, course: /\b(bdd|base.*donnee|sql|modele relationnel)\b/ },
  { subject: /\bmath/, course: /\b(math|mathematique)\b/ },
  { subject: /\balgorithm/, course: /\b(algo|algorithmique)\b/ },
  { subject: /\batelier/, course: /\b(atelier|at pro|projet professionnel)\b/ },
  { subject: /\breseau|systeme/, course: /\b(reseau|systeme|sisr|linux)\b/ },
  { subject: /\b(culture|eco|juridique|cejm)/, course: /\b(culture|cult eco|cejm|juridique|management)\b/ },
  { subject: /\bcyber/, course: /\b(cyber|securite|serv inform)\b/ },
] as const;

export function subjectForSchoolEvent(title: string, subjects: EntSubject[]): EntSubject | undefined {
  const course = normalize(title);
  for (const matcher of subjectMatchers) {
    if (!matcher.course.test(course)) continue;
    const subject = subjects.find((item) => matcher.subject.test(normalize(item.name)));
    if (subject) return subject;
  }
  return subjects.find((subject) => {
    const words = normalize(subject.name).split(" ").filter((word) => word.length >= 4);
    return words.length > 0 && words.some((word) => course.includes(word));
  });
}

export function resourcesForSchoolEvent(event: Pick<SchoolEvent, "title">, catalog: EntCatalog): { subject?: EntSubject; resources: EntResource[] } {
  const subject = subjectForSchoolEvent(event.title, catalog.subjects);
  if (!subject) return { resources: [] };
  const chapterIds = new Set(catalog.chapters.filter((chapter) => chapter.subjectId === subject.id).map((chapter) => chapter.id));
  return { subject, resources: catalog.resources.filter((resource) => chapterIds.has(resource.chapterId)) };
}
