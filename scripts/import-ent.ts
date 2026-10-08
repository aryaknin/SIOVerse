import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { readPostgresCatalog, isDatabaseUnavailable } from "../src/lib/ent-postgres";
import { addSubject, importEntFiles, mergeSubjectFolders, readEntCatalog, refreshImportedSubject, type EntImportFile } from "../src/lib/ent-store";

const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error("Indiquez le dossier source : npm run ent:import -- '/chemin/du/dossier'");

const subjects = [
  { directory: "Développement - Java", name: "Java", teacher: "M. BUFFETEAU", aliases: ["Développement - Java"] },
  { directory: "BDD", name: "BDD", teacher: "Mme. BENYATTOU", aliases: ["Bases de données"] },
  { directory: "Mathématiques", name: "Mathématiques", teacher: "M. RONCEUX", aliases: ["Maths"] },
  { directory: "Algorithmique", name: "Algorithmique", teacher: "M. RONCEUX", aliases: ["Algo"] },
  { directory: "Atelier de Pro", name: "Atelier professionnel", teacher: "M. PECHBERTY et Mme. BENYATTOU", aliases: ["Atelier pro"] },
  { directory: "Système et Réseaux", name: "Réseaux et systèmes", teacher: "M. HAGEGE", aliases: ["Système et Réseaux"] },
  { directory: "Culture Eco Juridique Management", name: "Culture éco et juridique", teacher: "Mme. ATTAL", aliases: ["CEJM"] },
  { directory: "Cybersécurité", name: "Cybersécurité", teacher: "M. SOUDRY", aliases: [] },
] as const;

function ignored(name: string): boolean {
  return name.startsWith(".") || ["node_modules", "__MACOSX", "target", "dist", "build", "__pycache__"].includes(name);
}

function displayPath(directory: string, relative: string): string {
  let parts = relative.split(path.sep);
  if (directory === "Atelier de Pro" && parts[0] === "contenus") {
    parts = parts.slice(1);
    if (parts[0] === "atelier-pro") parts = parts.slice(1);
  }
  const names: Record<string, string> = {
    cours1: "Cours 1", "cours 2": "Cours 2", AnciensDevoirs: "Anciens devoirs",
    TP1: "TP 1", TP2: "TP 2", "sujets-tps": "Sujets de TP", javascript: "JavaScript",
  };
  return parts.map((part, index) => index < parts.length - 1 ? names[part] ?? part : part).join("/");
}

async function scan(directory: string, relative = ""): Promise<EntImportFile[]> {
  const output: EntImportFile[] = [];
  for (const item of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    if (ignored(item.name)) continue;
    const child = path.join(relative, item.name);
    if (item.isDirectory()) output.push(...await scan(directory, child));
    else if (item.isFile()) output.push({ relativePath: child, content: await readFile(path.join(directory, child)) });
  }
  return output;
}

async function main() {
let totalImported = 0;
let totalSkipped = 0;
for (const subject of subjects) {
  const existing = await readEntCatalog();
  const names = [subject.name, ...subject.aliases].map((name) => name.toLocaleLowerCase("fr"));
  let target = existing.subjects.find((item) => names.includes(item.name.toLocaleLowerCase("fr")));
  if (!target) {
    const created = await addSubject({ name: subject.name, teacher: subject.teacher });
    target = created.subjects.find((item) => item.name === subject.name);
  }
  if (!target) throw new Error(`Impossible de créer la matière ${subject.name}.`);
  await refreshImportedSubject({ subjectId: target.id, name: subject.name, teacher: subject.teacher });
  const raw = await scan(path.join(sourceRoot, subject.directory));
  const normalized = raw.map((file) => ({ ...file, relativePath: displayPath(subject.directory, file.relativePath) }));
  const result = await importEntFiles({ subjectId: target.id, files: normalized });
  if (subject.name === "Java") {
    await mergeSubjectFolders({ subjectId: target.id, fromTitle: "TP 1", intoTitle: "TP1" });
    await mergeSubjectFolders({ subjectId: target.id, fromTitle: "TP 2", intoTitle: "TP2" });
  }
  totalImported += result.imported;
  totalSkipped += result.skipped.length;
  console.log(`${subject.name} (${subject.teacher}) : ${result.imported} fichiers, ${result.folders} dossiers, ${result.duplicates} doublons, ${result.skipped.length} ignorés.`);
  for (const skipped of result.skipped) console.log(`  Format ignoré : ${skipped}`);
}

const final = await readEntCatalog();
console.log(`Catalogue : ${final.subjects.length} matières, ${final.chapters.length} dossiers, ${final.resources.length} ressources. Nouveaux fichiers : ${totalImported}. Ignorés : ${totalSkipped}.`);
try {
  const database = await readPostgresCatalog();
  console.log(`PostgreSQL : ${database.subjects.length} matières, ${database.chapters.length} dossiers, ${database.resources.length} ressources.`);
} catch (error) {
  if (!isDatabaseUnavailable(error)) throw error;
  console.log("PostgreSQL indisponible : l’import est préparé localement et sera synchronisé à sa prochaine connexion.");
}
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
