import assert from "node:assert/strict";
import test from "node:test";
import { resourcesForSchoolEvent, subjectForSchoolEvent } from "../src/lib/agenda-linking.ts";

const subjects = [
  { id: "java", name: "Java", teacher: "M. BUFFETEAU", color: "blue", createdAt: "" },
  { id: "cejm", name: "Culture éco et juridique", teacher: "Mme. ATTAL", color: "pink", createdAt: "" },
  { id: "cyber", name: "Cybersécurité", teacher: "M. SOUDRY", color: "green", createdAt: "" },
];

test("les intitulés abrégés ÉcoleDirecte retrouvent leur matière", () => {
  assert.equal(subjectForSchoolEvent("CULT.ECO JUR. MANAG.", subjects)?.id, "cejm");
  assert.equal(subjectForSchoolEvent("CYBER.SERV.INFORM...", subjects)?.id, "cyber");
  assert.equal(subjectForSchoolEvent("Java - TP objets", subjects)?.id, "java");
  assert.equal(subjectForSchoolEvent("ANGLAIS LV1", subjects), undefined);
});

test("les ressources d’un cours restent limitées aux dossiers de sa matière", () => {
  const catalog = {
    version: 1,
    subjects,
    chapters: [{ id: "chapter-java", subjectId: "java", parentId: null, title: "TP", position: 0 }],
    resources: [{ id: "resource", chapterId: "chapter-java", title: "TP 1", kind: "COURSE", teacher: "", originalName: "tp.pdf", mimeType: "application/pdf", storedName: "resource.pdf", externalUrl: null, createdAt: "" }],
    assessments: [],
  };
  const linked = resourcesForSchoolEvent({ title: "JAVA" }, catalog);
  assert.equal(linked.subject?.id, "java");
  assert.deepEqual(linked.resources.map((resource) => resource.id), ["resource"]);
});
