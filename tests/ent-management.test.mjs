import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

test("archives intactes, renommage, déplacement et suppression des ressources", async () => {
  const previousDirectory = process.cwd();
  const directory = await mkdtemp(path.join(os.tmpdir(), "sioverse-ent-test-"));
  process.env.SIOVERSE_ENT_STAGE_ONLY = "1";
  process.chdir(directory);
  try {
    const { addSubject, addChapter, importEntFiles, moveEntItem, renameEntItem, deleteEntItem, readEntCatalog } = await import("../src/lib/ent-store.ts");
    const first = (await addSubject({ name: "Java", teacher: "M. BUFFETEAU" })).subjects[0];
    const second = (await addSubject({ name: "BDD", teacher: "Mme. BENYATTOU" })).subjects[1];
    const source = (await addChapter({ subjectId: first.id, title: "TP" })).chapters.at(-1);
    const destination = (await addChapter({ subjectId: second.id, title: "Projets" })).chapters.at(-1);
    const archive = Buffer.from("504b0506000000000000000000000000000000000000", "hex");
    const imported = await importEntFiles({ subjectId: first.id, parentId: source.id, files: [{ relativePath: "original.zip", content: archive }] });
    assert.equal(imported.imported, 1);
    assert.equal(imported.folders, 0);
    assert.equal(imported.catalog.resources[0].kind, "ARCHIVE");
    assert.deepEqual(await readFile(path.join(directory, "storage/ent/files", imported.catalog.resources[0].storedName)), archive);
    await renameEntItem({ kind: "resource", id: imported.catalog.resources[0].id, name: "Archive authentique" });
    await moveEntItem({ kind: "resource", id: imported.catalog.resources[0].id, subjectId: second.id, parentId: destination.id });
    let catalog = await readEntCatalog();
    assert.equal(catalog.resources[0].title, "Archive authentique");
    assert.equal(catalog.resources[0].chapterId, destination.id);
    const child = (await addChapter({ subjectId: first.id, parentId: source.id, title: "Enfant" })).chapters.at(-1);
    await assert.rejects(moveEntItem({ kind: "chapter", id: source.id, subjectId: first.id, parentId: child.id }), /sous-dossier/);
    await renameEntItem({ kind: "chapter", id: source.id, name: "Travaux pratiques" });
    await moveEntItem({ kind: "chapter", id: source.id, subjectId: second.id, parentId: destination.id });
    catalog = await readEntCatalog();
    assert.equal(catalog.chapters.find((item) => item.id === source.id).title, "Travaux pratiques");
    assert.equal(catalog.chapters.find((item) => item.id === child.id).subjectId, second.id);
    await deleteEntItem({ kind: "resource", id: imported.catalog.resources[0].id });
    catalog = await readEntCatalog();
    assert.equal(catalog.resources.length, 0);
    assert.ok(catalog.deleted.resources.includes(imported.catalog.resources[0].id));
    assert.deepEqual(await readFile(path.join(directory, "storage/ent/trash", imported.catalog.resources[0].storedName)), archive);
    await deleteEntItem({ kind: "chapter", id: source.id });
    catalog = await readEntCatalog();
    assert.ok(!catalog.chapters.some((item) => item.id === source.id || item.id === child.id));
  } finally {
    process.chdir(previousDirectory);
    await rm(directory, { recursive: true, force: true });
  }
});
