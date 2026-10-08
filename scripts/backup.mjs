import { spawn } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const connection = process.env.DATABASE_URL;
if (!connection) throw new Error("DATABASE_URL est nécessaire pour créer une sauvegarde.");

const url = new URL(connection);
if (!url.pathname.slice(1)) throw new Error("Nom de base PostgreSQL manquant.");
process.umask(0o077);
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const destination = path.join(process.cwd(), "storage", "backups", `${stamp}-${randomBytes(3).toString("hex")}`);
await mkdir(destination, { recursive: true, mode: 0o700 });

const args = [
  "--format=custom", "--no-owner", "--no-privileges",
  "--host", url.hostname, "--port", url.port || "5432",
  "--username", decodeURIComponent(url.username),
  "--dbname", decodeURIComponent(url.pathname.slice(1)),
  "--file", path.join(destination, "database.dump"),
];
await new Promise((resolve, reject) => {
  const child = spawn("pg_dump", args, { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) } });
  child.once("error", reject);
  child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`pg_dump a échoué (code ${code}). La sauvegarde est incomplète : ${destination}`)));
});

await cp(path.join(process.cwd(), "storage", "ent"), path.join(destination, "ent"), { recursive: true, force: false });
await writeFile(path.join(destination, "README.txt"), "Sauvegarde SIOVerse : database.dump (PostgreSQL) + ent/ (cours et catalogue). Conserver ce dossier dans un endroit privé.\n", { mode: 0o600 });
process.stdout.write(`Sauvegarde créée : ${destination}\n`);
