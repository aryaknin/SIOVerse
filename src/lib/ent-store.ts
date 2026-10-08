import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AssessmentKind, EntAssessment, EntCatalog, EntChapter, EntResource, EntSubject, ResourceKind } from "./ent";
import { descendantChapterIds } from "./ent";
import { entMimeTypes, fileExtension, isArchive, resourceKindForFile, validFileContent } from "./ent-file-types";
import { isDatabaseUnavailable, readPostgresCatalog, savePostgresCatalog } from "./ent-postgres";

const root = path.join(process.cwd(), "storage", "ent");
const documentRoot = path.join(root, "files");
const trashRoot = path.join(root, "trash");
const catalogPath = path.join(root, "catalog.json");
const palette = ["violet", "blue", "green", "orange", "rose", "teal"];
let pendingWrite: Promise<unknown> = Promise.resolve();

function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingWrite.then(operation);
  pendingWrite = result.catch(() => undefined);
  return result;
}

async function readLocalCatalog(): Promise<EntCatalog> {
  try {
    const text = await readFile(catalogPath, "utf8");
    const catalog = JSON.parse(text) as EntCatalog;
    if (catalog.version !== 1 || !Array.isArray(catalog.subjects) || !Array.isArray(catalog.chapters) || !Array.isArray(catalog.resources) || !Array.isArray(catalog.assessments)) {
      throw new Error("Le catalogue local est invalide.");
    }
    catalog.chapters = catalog.chapters.map((chapter) => ({ ...chapter, parentId: chapter.parentId ?? null }));
    catalog.resources = catalog.resources.map((resource) => ({ ...resource, sourceKey: resource.sourceKey ?? null }));
    catalog.deleted ??= { subjects: [], chapters: [], resources: [], assessments: [] };
    return catalog;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, subjects: [], chapters: [], resources: [], assessments: [], deleted: { subjects: [], chapters: [], resources: [], assessments: [] } };
    }
    throw error;
  }
}

async function writeLocalCatalog(catalog: EntCatalog) {
  await mkdir(root, { recursive: true });
  const temporary = path.join(root, `catalog-${randomUUID()}.tmp`);
  const stored: EntCatalog = { version: 1, subjects: catalog.subjects, chapters: catalog.chapters, resources: catalog.resources, assessments: catalog.assessments, deleted: catalog.deleted };
  await writeFile(temporary, JSON.stringify(stored, null, 2) + "\n", { flag: "wx" });
  await rename(temporary, catalogPath);
}

export async function readEntCatalog(): Promise<EntCatalog> {
  const local = await readLocalCatalog();
  const unknownSizes = local.resources.filter((resource) => resource.storedName && resource.sizeBytes == null && new RegExp(`^${resource.id}\\.[a-z0-9]+$`).test(resource.storedName));
  for (let offset = 0; offset < unknownSizes.length; offset += 50) {
    await Promise.all(unknownSizes.slice(offset, offset + 50).map(async (resource) => {
      try { resource.sizeBytes = (await stat(path.join(documentRoot, resource.storedName!))).size; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }));
  }
  if (unknownSizes.some((resource) => resource.sizeBytes != null)) await writeLocalCatalog(local);
  try {
    const database = await readPostgresCatalog();
    const merge = <T extends { id: string }>(key: keyof NonNullable<EntCatalog["deleted"]>, remote: T[], offline: T[]) => {
      const removed = new Set(local.deleted?.[key] ?? []);
      return [...new Map([...remote.filter((item) => !removed.has(item.id)), ...offline].map((item) => [item.id, item])).values()];
    };
    const synced: EntCatalog = { version: 1, deleted: local.deleted,
      subjects: merge("subjects", database.subjects, local.subjects),
      chapters: merge("chapters", database.chapters, local.chapters),
      resources: merge("resources", database.resources, local.resources),
      assessments: merge("assessments", database.assessments, local.assessments),
    };
    if (JSON.stringify(synced.subjects) !== JSON.stringify(database.subjects) || JSON.stringify(synced.chapters) !== JSON.stringify(database.chapters) || JSON.stringify(synced.resources) !== JSON.stringify(database.resources) || JSON.stringify(synced.assessments) !== JSON.stringify(database.assessments)) await savePostgresCatalog(synced);
    await writeLocalCatalog(synced);
    return { ...synced, storageStatus: "postgres" };
  } catch (error) {
    if (isDatabaseUnavailable(error)) return { ...local, storageStatus: "local" };
    throw error;
  }
}

async function writeEntCatalog(catalog: EntCatalog) {
  try { await savePostgresCatalog(catalog); }
  catch (error) { if (!isDatabaseUnavailable(error)) throw error; }
  await writeLocalCatalog(catalog);
}

export async function addSubject(input: { name: string; teacher: string }): Promise<EntCatalog> {
  return serial(async () => {
    const catalog = await readEntCatalog();
    if (catalog.subjects.some((subject) => subject.name.toLocaleLowerCase("fr") === input.name.toLocaleLowerCase("fr"))) {
      throw new Error("Cette matière existe déjà.");
    }
    const subject: EntSubject = { id: randomUUID(), name: input.name, teacher: input.teacher, color: palette[catalog.subjects.length % palette.length], createdAt: new Date().toISOString() };
    catalog.subjects.push(subject);
    await writeEntCatalog(catalog);
    return catalog;
  });
}

export async function refreshImportedSubject(input: { subjectId: string; name: string; teacher: string }): Promise<EntCatalog> {
  return serial(async () => {
    const catalog = await readEntCatalog();
    const subject = catalog.subjects.find((item) => item.id === input.subjectId);
    if (!subject) throw new Error("Matière introuvable.");
    if (catalog.subjects.some((item) => item.id !== subject.id && item.name.toLocaleLowerCase("fr") === input.name.toLocaleLowerCase("fr"))) throw new Error("Une autre matière porte déjà ce nom.");
    subject.name = input.name;
    subject.teacher = input.teacher;
    const chapterIds = new Set(catalog.chapters.filter((item) => item.subjectId === subject.id).map((item) => item.id));
    for (const resource of catalog.resources) {
      if (chapterIds.has(resource.chapterId) && resource.sourceKey) {
        resource.teacher = input.teacher;
        if (resource.originalName) resource.kind = resourceKindForFile(resource.originalName);
      }
    }
    await writeEntCatalog(catalog);
    return catalog;
  });
}

export async function mergeSubjectFolders(input: { subjectId: string; fromTitle: string; intoTitle: string }): Promise<EntCatalog> {
  return serial(async () => {
    const catalog = await readEntCatalog();
    const from = catalog.chapters.find((item) => item.subjectId === input.subjectId && item.parentId === null && item.title === input.fromTitle);
    const into = catalog.chapters.find((item) => item.subjectId === input.subjectId && item.parentId === null && item.title === input.intoTitle);
    if (!from || !into || from.id === into.id) return catalog;
    for (const chapter of catalog.chapters) if (chapter.parentId === from.id) chapter.parentId = into.id;
    for (const resource of catalog.resources) if (resource.chapterId === from.id) resource.chapterId = into.id;
    for (const assessment of catalog.assessments) assessment.chapterIds = assessment.chapterIds.map((id) => id === from.id ? into.id : id);
    catalog.chapters = catalog.chapters.filter((item) => item.id !== from.id);
    catalog.deleted?.chapters.push(from.id);
    await writeEntCatalog(catalog);
    return catalog;
  });
}

type CatalogItemKind = "subject" | "chapter" | "resource";

function findItem(catalog: EntCatalog, kind: CatalogItemKind, id: string): EntSubject | EntChapter | EntResource {
  const item = kind === "subject" ? catalog.subjects.find((subject) => subject.id === id)
    : kind === "chapter" ? catalog.chapters.find((chapter) => chapter.id === id)
      : catalog.resources.find((resource) => resource.id === id);
  if (!item) throw new Error("Élément introuvable.");
  return item;
}

export async function renameEntItem(input: { kind: CatalogItemKind; id: string; name: string; teacher?: string }): Promise<EntCatalog> {
  return serial(async () => {
    const catalog = await readEntCatalog();
    const item = findItem(catalog, input.kind, input.id);
    if (input.kind === "subject") {
      if (catalog.subjects.some((subject) => subject.id !== input.id && subject.name.toLocaleLowerCase("fr") === input.name.toLocaleLowerCase("fr"))) throw new Error("Cette matière existe déjà.");
      (item as EntSubject).name = input.name;
      if (input.teacher !== undefined) (item as EntSubject).teacher = input.teacher;
    } else if (input.kind === "chapter") {
      const chapter = item as EntChapter;
      if (catalog.chapters.some((other) => other.id !== chapter.id && other.subjectId === chapter.subjectId && other.parentId === chapter.parentId && other.title.toLocaleLowerCase("fr") === input.name.toLocaleLowerCase("fr"))) throw new Error("Un dossier porte déjà ce nom ici.");
      chapter.title = input.name;
    } else (item as EntResource).title = input.name;
    await writeEntCatalog(catalog);
    return catalog;
  });
}

export async function moveEntItem(input: { kind: "chapter" | "resource"; id: string; subjectId: string; parentId: string | null }): Promise<EntCatalog> {
  return serial(async () => {
    const catalog = await readEntCatalog();
    if (!catalog.subjects.some((item) => item.id === input.subjectId)) throw new Error("Matière de destination introuvable.");
    const parent = input.parentId ? catalog.chapters.find((item) => item.id === input.parentId) : null;
    if (input.parentId && (!parent || parent.subjectId !== input.subjectId)) throw new Error("Dossier de destination introuvable.");
    if (input.kind === "resource") {
      if (!parent) throw new Error("Choisis un dossier pour cette ressource.");
      (findItem(catalog, "resource", input.id) as EntResource).chapterId = parent.id;
    } else {
      const folder = findItem(catalog, "chapter", input.id) as EntChapter;
      const subtree = descendantChapterIds(catalog.chapters, folder.id);
      if (parent && subtree.has(parent.id)) throw new Error("Un dossier ne peut pas être placé dans lui-même ou dans un sous-dossier.");
      if (catalog.chapters.some((item) => item.id !== folder.id && item.subjectId === input.subjectId && item.parentId === input.parentId && item.title.toLocaleLowerCase("fr") === folder.title.toLocaleLowerCase("fr"))) throw new Error("Un dossier porte déjà ce nom à cet emplacement.");
      folder.parentId = input.parentId;
      folder.position = catalog.chapters.filter((item) => item.subjectId === input.subjectId && item.parentId === input.parentId && item.id !== folder.id).length + 1;
      for (const item of catalog.chapters) if (subtree.has(item.id)) item.subjectId = input.subjectId;
      for (const assessment of catalog.assessments) if (assessment.subjectId !== input.subjectId) assessment.chapterIds = assessment.chapterIds.filter((id) => !subtree.has(id));
    }
    await writeEntCatalog(catalog);
    return catalog;
  });
}

export async function deleteEntItem(input: { kind: CatalogItemKind; id: string }): Promise<EntCatalog> {
  return serial(async () => {
    const catalog = await readEntCatalog();
    findItem(catalog, input.kind, input.id);
    const subjectIds = input.kind === "subject" ? new Set([input.id]) : new Set<string>();
    const chapterIds = input.kind === "subject" ? new Set(catalog.chapters.filter((item) => subjectIds.has(item.subjectId)).map((item) => item.id))
      : input.kind === "chapter" ? descendantChapterIds(catalog.chapters, input.id) : new Set<string>();
    const resources = catalog.resources.filter((item) => item.id === input.id && input.kind === "resource" || chapterIds.has(item.chapterId));
    const resourceIds = new Set(resources.map((item) => item.id));
    const assessments = catalog.assessments.filter((item) => subjectIds.has(item.subjectId));
    catalog.subjects = catalog.subjects.filter((item) => !subjectIds.has(item.id));
    catalog.chapters = catalog.chapters.filter((item) => !chapterIds.has(item.id));
    catalog.resources = catalog.resources.filter((item) => !resourceIds.has(item.id));
    catalog.assessments = catalog.assessments.filter((item) => !subjectIds.has(item.subjectId)).map((item) => ({ ...item, chapterIds: item.chapterIds.filter((id) => !chapterIds.has(id)) }));
    catalog.deleted ??= { subjects: [], chapters: [], resources: [], assessments: [] };
    catalog.deleted.subjects.push(...subjectIds);
    catalog.deleted.chapters.push(...chapterIds);
    catalog.deleted.resources.push(...resourceIds);
    catalog.deleted.assessments.push(...assessments.map((item) => item.id));
    await writeEntCatalog(catalog);
    if (resources.some((item) => item.storedName)) {
      await mkdir(trashRoot, { recursive: true });
      for (const resource of resources) if (resource.storedName && new RegExp(`^${resource.id}\\.[a-z0-9]+$`).test(resource.storedName)) {
        await rename(path.join(documentRoot, resource.storedName), path.join(trashRoot, resource.storedName)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
      }
    }
    return catalog;
  });
}

export async function addChapter(input: { subjectId: string; parentId?: string | null; title: string }): Promise<EntCatalog> {
  return serial(async () => {
    const catalog = await readEntCatalog();
    if (!catalog.subjects.some((subject) => subject.id === input.subjectId)) throw new Error("Matière introuvable.");
    const parentId = input.parentId ?? null;
    if (parentId && !catalog.chapters.some((chapter) => chapter.id === parentId && chapter.subjectId === input.subjectId)) throw new Error("Dossier parent introuvable.");
    if (catalog.chapters.some((chapter) => chapter.subjectId === input.subjectId && chapter.parentId === parentId && chapter.title.toLocaleLowerCase("fr") === input.title.toLocaleLowerCase("fr"))) {
      throw new Error("Ce dossier existe déjà à cet emplacement.");
    }
    const chapter: EntChapter = { id: randomUUID(), subjectId: input.subjectId, parentId, title: input.title, position: catalog.chapters.filter((item) => item.subjectId === input.subjectId && item.parentId === parentId).length + 1 };
    catalog.chapters.push(chapter);
    await writeEntCatalog(catalog);
    return catalog;
  });
}

export async function addLink(input: { chapterId: string; title: string; teacher: string; url: string }): Promise<EntCatalog> {
  return serial(async () => {
    const catalog = await readEntCatalog();
    if (!catalog.chapters.some((chapter) => chapter.id === input.chapterId)) throw new Error("Chapitre introuvable.");
    const resource: EntResource = { id: randomUUID(), chapterId: input.chapterId, title: input.title, kind: "LINK", teacher: input.teacher, originalName: null, mimeType: null, storedName: null, externalUrl: input.url, sourceKey: null, createdAt: new Date().toISOString() };
    catalog.resources.push(resource);
    await writeEntCatalog(catalog);
    return catalog;
  });
}

export async function addDocument(input: { chapterId: string; title: string; teacher: string; kind: Exclude<ResourceKind, "LINK">; file: File; extension: string; mimeType: string }): Promise<EntCatalog> {
  return serial(async () => {
    const catalog = await readEntCatalog();
    if (!catalog.chapters.some((chapter) => chapter.id === input.chapterId)) throw new Error("Chapitre introuvable.");
    const id = randomUUID();
    const storedName = `${id}.${input.extension}`;
    await mkdir(documentRoot, { recursive: true });
    const content = Buffer.from(await input.file.arrayBuffer());
    if (!validFileContent(input.extension, content)) throw new Error("Le contenu du fichier ne correspond pas à son format.");
    await writeFile(path.join(documentRoot, storedName), content, { flag: "wx" });
    const resource: EntResource = { id, chapterId: input.chapterId, title: input.title, kind: input.kind, teacher: input.teacher, originalName: input.file.name, mimeType: input.mimeType, storedName, externalUrl: null, sourceKey: null, sizeBytes: input.file.size, createdAt: new Date().toISOString() };
    catalog.resources.push(resource);
    await writeEntCatalog(catalog);
    return catalog;
  });
}

export type EntImportFile = { relativePath: string; content: Buffer };
export type EntImportResult = { catalog: EntCatalog; imported: number; duplicates: number; skipped: string[]; folders: number };

function safeImportPath(value: string): string[] | null {
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.includes("\0")) return null;
  const segments = normalized.split("/");
  if (!segments.length || segments.length > 16 || segments.some((part) => !part || part === "." || part === ".." || part.startsWith(".") || part.length > 180)) return null;
  return segments;
}

export async function importEntFiles(input: { subjectId: string; parentId?: string | null; files: EntImportFile[] }): Promise<EntImportResult> {
  return serial(async () => {
    if (input.files.length > 500) throw new Error("L’import est limité à 500 fichiers par envoi.");
    if (input.files.reduce((total, file) => total + file.content.length, 0) > 200 * 1024 * 1024) throw new Error("L’import dépasse 200 Mo.");
    const catalog = await readEntCatalog();
    const subject = catalog.subjects.find((item) => item.id === input.subjectId);
    if (!subject) throw new Error("Matière introuvable.");
    const subjectId = subject.id;
    const subjectTeacher = subject.teacher;
    const rootParentId = input.parentId ?? null;
    if (rootParentId && !catalog.chapters.some((item) => item.id === rootParentId && item.subjectId === subjectId)) throw new Error("Dossier parent introuvable.");
    const result = { catalog, imported: 0, duplicates: 0, skipped: [] as string[], folders: 0 };
    const writtenNames: string[] = [];
    await mkdir(documentRoot, { recursive: true });

    function ensureFolder(title: string, parentId: string | null): string {
      const existing = catalog.chapters.find((item) => item.subjectId === subjectId && item.parentId === parentId && item.title.toLocaleLowerCase("fr") === title.toLocaleLowerCase("fr"));
      if (existing) return existing.id;
      const chapter: EntChapter = { id: randomUUID(), subjectId, parentId, title, position: catalog.chapters.filter((item) => item.subjectId === subjectId && item.parentId === parentId).length + 1 };
      catalog.chapters.push(chapter);
      result.folders++;
      return chapter.id;
    }

    try {
      for (const file of input.files) {
        const segments = safeImportPath(file.relativePath);
        const extension = segments ? fileExtension(segments.at(-1) ?? "") : "";
        if (!segments || !entMimeTypes[extension] || !validFileContent(extension, file.content) || file.content.length > (isArchive(file.relativePath) ? 50 : 25) * 1024 * 1024) {
          result.skipped.push(file.relativePath);
          continue;
        }
        const sourceKey = `import:${subjectId}:${rootParentId ?? "root"}:${segments.join("/")}`;
        if (catalog.resources.some((item) => item.sourceKey === sourceKey)) { result.duplicates++; continue; }
        let parentId = rootParentId;
        const folderSegments = segments.slice(0, -1);
        if (!folderSegments.length && !parentId) folderSegments.push("Documents");
        for (const segment of folderSegments) parentId = ensureFolder(segment, parentId);
        if (!parentId) throw new Error("Le dossier de destination est introuvable.");
        const name = segments.at(-1)!;
        const id = randomUUID();
        const storedName = `${id}.${extension}`;
        await writeFile(path.join(documentRoot, storedName), file.content, { flag: "wx" });
        writtenNames.push(storedName);
        catalog.resources.push({
          id, chapterId: parentId, title: name.slice(0, -(extension.length + 1)).replaceAll("_", " "),
          kind: resourceKindForFile(name), teacher: subjectTeacher, originalName: name,
          mimeType: entMimeTypes[extension], storedName, externalUrl: null, sourceKey, sizeBytes: file.content.length, createdAt: new Date().toISOString(),
        });
        result.imported++;
      }
      if (result.imported || result.folders) await writeEntCatalog(catalog);
      return result;
    } catch (error) {
      await Promise.all(writtenNames.map((name) => unlink(path.join(documentRoot, name)).catch(() => undefined)));
      throw error;
    }
  });
}

export async function addAssessment(input: { kind: AssessmentKind; title: string; subjectId: string; chapterIds: string[]; scheduledAt: string; details: string; room: string }): Promise<EntCatalog> {
  return serial(async () => {
    const catalog = await readEntCatalog();
    if (!catalog.subjects.some((subject) => subject.id === input.subjectId)) throw new Error("Matière introuvable.");
    if (input.chapterIds.some((id) => !catalog.chapters.some((chapter) => chapter.id === id && chapter.subjectId === input.subjectId))) {
      throw new Error("Les chapitres doivent appartenir à la matière sélectionnée.");
    }
    const assessment: EntAssessment = { id: randomUUID(), ...input, createdAt: new Date().toISOString() };
    catalog.assessments.push(assessment);
    await writeEntCatalog(catalog);
    return catalog;
  });
}

export async function readEntDocument(resourceId: string): Promise<{ content: Buffer; resource: EntResource } | null> {
  const catalog = await readEntCatalog();
  const resource = catalog.resources.find((item) => item.id === resourceId && item.storedName);
  if (!resource?.storedName || !new RegExp(`^${resource.id}\\.[a-z0-9]+$`).test(resource.storedName)) return null;
  try {
    return { content: await readFile(path.join(documentRoot, resource.storedName)), resource };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
