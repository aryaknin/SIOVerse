export const resourceKinds = ["COURSE", "EXERCISE", "CORRECTION", "CHEATSHEET", "ARCHIVE", "LINK"] as const;
export type ResourceKind = (typeof resourceKinds)[number];
export type AssessmentKind = "CONTROL" | "HOMEWORK";

export type EntSubject = {
  id: string;
  name: string;
  teacher: string;
  color: string;
  createdAt: string;
};

export type EntChapter = {
  id: string;
  subjectId: string;
  parentId: string | null;
  title: string;
  position: number;
};

export type EntResource = {
  id: string;
  chapterId: string;
  title: string;
  kind: ResourceKind;
  teacher: string;
  originalName: string | null;
  mimeType: string | null;
  storedName: string | null;
  externalUrl: string | null;
  sourceKey?: string | null;
  sizeBytes?: number | null;
  createdAt: string;
};

export type EntAssessment = {
  id: string;
  kind: AssessmentKind;
  title: string;
  subjectId: string;
  chapterIds: string[];
  scheduledAt: string;
  details: string;
  room: string;
  createdAt: string;
};

export type EntCatalog = {
  version: 1;
  storageStatus?: "postgres" | "local";
  deleted?: { subjects: string[]; chapters: string[]; resources: string[]; assessments: string[] };
  subjects: EntSubject[];
  chapters: EntChapter[];
  resources: EntResource[];
  assessments: EntAssessment[];
};

export function resourcesForAssessment(catalog: EntCatalog, assessment: EntAssessment): EntResource[] {
  const chapterIds = new Set(assessment.chapterIds.flatMap((id) => [...descendantChapterIds(catalog.chapters, id)]));
  return catalog.resources.filter((resource) => chapterIds.has(resource.chapterId));
}

export function descendantChapterIds(chapters: EntChapter[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  for (const chapter of chapters) {
    let parentId = chapter.parentId;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      if (parentId === rootId) { ids.add(chapter.id); break; }
      visited.add(parentId);
      parentId = chapters.find((item) => item.id === parentId)?.parentId ?? null;
    }
  }
  return ids;
}

export function chapterPath(chapters: EntChapter[], id: string): string[] {
  const names: string[] = [];
  const visited = new Set<string>();
  let current = chapters.find((item) => item.id === id);
  while (current && !visited.has(current.id)) {
    names.unshift(current.title);
    visited.add(current.id);
    current = chapters.find((item) => item.id === current?.parentId);
  }
  return names;
}

export function resourceKindLabel(kind: ResourceKind): string {
  return {
    COURSE: "Cours",
    EXERCISE: "Exercice",
    CORRECTION: "Corrigé",
    CHEATSHEET: "Fiche",
    ARCHIVE: "Archive",
    LINK: "Lien",
  }[kind];
}
