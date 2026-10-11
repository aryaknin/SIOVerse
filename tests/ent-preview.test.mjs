import test from "node:test";
import assert from "node:assert/strict";
import { createZip } from "../src/lib/zip.ts";
import { buildEntPreview, listArchiveEntries } from "../src/lib/ent-preview.ts";

const resource = {
  id: "00000000-0000-0000-0000-000000000001",
  chapterId: "chapter",
  title: "Exemple",
  kind: "COURSE",
  teacher: "",
  originalName: "exemple.ts",
  mimeType: "text/plain",
  storedName: "example",
  externalUrl: null,
  sizeBytes: 20,
  createdAt: "2026-10-11T00:00:00.000Z",
};

test("la prévisualisation de code conserve les lignes et le langage", async () => {
  const preview = await buildEntPreview(resource, Buffer.from("const answer = 42;\nreturn answer;"));
  assert.equal(preview.kind, "text");
  assert.equal(preview.language, "ts");
  assert.deepEqual(preview.lines, ["const answer = 42;", "return answer;"]);
  assert.equal(preview.truncated, false);
});

test("une archive ZIP est listée sans être extraite", () => {
  const zip = createZip([
    { name: "Cours/chapitre.txt", content: Buffer.from("contenu") },
    { name: "image.png", content: Buffer.from([1, 2, 3]) },
  ]);
  const preview = listArchiveEntries(zip, "cours.zip");
  assert.deepEqual(preview.entries.map(({ name, size }) => ({ name, size })), [
    { name: "Cours/chapitre.txt", size: 7 },
    { name: "image.png", size: 3 },
  ]);
  assert.equal(preview.truncated, false);
});

test("un DOCX fournit un aperçu textuel de secours", async () => {
  const docx = createZip([{ name: "word/document.xml", content: Buffer.from("<w:document><w:p><w:r><w:t>Bonjour SIOVerse</w:t></w:r></w:p></w:document>") }]);
  const preview = await buildEntPreview({ ...resource, originalName: "cours.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, docx);
  assert.equal(preview.kind, "office");
  assert.equal(preview.sections[0].lines[0], "Bonjour SIOVerse");
});
