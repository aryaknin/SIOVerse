import assert from "node:assert/strict";
import { test } from "node:test";
import { descendantChapterIds, resourcesForAssessment } from "../src/lib/ent.ts";
import { resourceKindForFile, isArchive, validFileContent } from "../src/lib/ent-file-types.ts";

test("les sous-dossiers sont inclus dans les ressources d’un contrôle", () => {
  const chapters = [
    { id: "one", subjectId: "s", parentId: null, title: "Cours 1", position: 1 },
    { id: "two", subjectId: "s", parentId: "one", title: "Exercices", position: 1 },
    { id: "three", subjectId: "s", parentId: "two", title: "Corrigés", position: 1 },
    { id: "other", subjectId: "s", parentId: null, title: "Cours 2", position: 2 },
  ];
  const resources = chapters.map((chapter) => ({ id: chapter.id, chapterId: chapter.id }));
  assert.deepEqual([...descendantChapterIds(chapters, "one")].sort(), ["one", "three", "two"]);
  assert.deepEqual(resourcesForAssessment({ chapters, resources }, { chapterIds: ["one"] }).map((item) => item.id), ["one", "two", "three"]);
});

test("les fichiers de cours, exercices, corrigés et archives sont reconnus", () => {
  assert.equal(resourceKindForFile("TD1_-_Découverte.pdf"), "EXERCISE");
  assert.equal(resourceKindForFile("corrigé-centrecall.md"), "CORRECTION");
  assert.equal(resourceKindForFile("cours_reseaux.pdf"), "COURSE");
  assert.equal(resourceKindForFile("TP1 - Etudiants.zip"), "ARCHIVE");
  assert.equal(isArchive("projet.tar.gz"), true);
});

test("un fichier renommé avec une fausse extension est refusé", () => {
  assert.equal(validFileContent("pdf", Buffer.from("faux pdf")), false);
  assert.equal(validFileContent("zip", Buffer.from("faux zip")), false);
  assert.equal(validFileContent("zip", Buffer.from("504b0506000000000000000000000000000000000000", "hex")), true);
  assert.equal(validFileContent("pdf", Buffer.from("%PDF-1.7\n")), true);
  assert.equal(validFileContent("txt", Buffer.from([65, 0, 66])), false);
});
