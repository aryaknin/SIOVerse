import "dotenv/config";

import { deleteEntItem, readEntCatalog } from "../src/lib/ent-store";
import { descendantChapterIds } from "../src/lib/ent";

const targets = [
  {
    folderId: "cb43f03c-2559-4e11-b809-a6db229606e3",
    archiveId: "f9237b70-0313-4e96-8971-39f4442379cc",
    resourceIds: ["d563d4fb-5e3a-4106-b92e-aac51d2c790a", "223e105b-4e00-47f8-b6b3-7eb8f9b2fa1f"],
  },
  {
    folderId: "8aac01f9-ff84-4067-b736-b1114c2b42c3",
    archiveId: "b6295e4b-1363-4ceb-9825-243fb1ec3b48",
    resourceIds: ["4c7dfb2e-106f-4057-898c-54b0b963eaad", "2ef73ca7-e99a-4283-aa8d-7231da3e985c"],
  },
];

async function main() {
  for (const target of targets) {
    const catalog = await readEntCatalog();
    const archive = catalog.resources.find((item) => item.id === target.archiveId);
    if (!archive || archive.kind !== "ARCHIVE" || !archive.originalName?.endsWith(".zip")) throw new Error(`Archive originale manquante : ${target.archiveId}`);
    const archiveBaseName = archive.originalName.slice(0, -4);
    const folder = catalog.chapters.find((item) => item.id === target.folderId);
    if (!folder) { console.log(`Déjà nettoyé : ${target.folderId}`); continue; }
    const descendants = descendantChapterIds(catalog.chapters, folder.id);
    const contents = catalog.resources.filter((item) => descendants.has(item.chapterId));
    if (contents.length !== target.resourceIds.length || contents.some((item) => !target.resourceIds.includes(item.id) || !item.sourceKey?.includes(`${archiveBaseName}/`))) {
      throw new Error(`Le dossier ${folder.title} contient d’autres ressources : aucun nettoyage effectué.`);
    }
    await deleteEntItem({ kind: "chapter", id: folder.id });
    console.log(`Nettoyé : ${folder.title}, ${contents.length} copies extraites. Archive ${archive.originalName} conservée.`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
