import "server-only";

import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gunzipSync, inflateRawSync } from "node:zlib";
import type { EntResource } from "./ent";

const execFileAsync = promisify(execFile);
const maxTextCharacters = 250_000;
const maxArchiveEntries = 2_000;
const libreOfficePath = process.env.LIBREOFFICE_PATH || "/usr/bin/libreoffice";

export type PreviewArchiveEntry = { name: string; size: number; directory: boolean };
export type EntPreviewData =
  | { kind: "text"; language: string; lines: string[]; truncated: boolean }
  | { kind: "archive"; entries: PreviewArchiveEntry[]; truncated: boolean }
  | { kind: "office"; format: "document" | "presentation" | "spreadsheet"; sections: { title: string; lines: string[] }[]; truncated: boolean; pdfAvailable: boolean }
  | { kind: "none"; message: string };

type ZipEntry = PreviewArchiveEntry & { compression: number; compressedSize: number; localOffset: number };

function extensionOf(name: string | null): string {
  return path.extname(name ?? "").slice(1).toLowerCase();
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"").replaceAll("&apos;", "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function xmlLines(xml: string): string[] {
  const withBreaks = xml
    .replace(/<w:tab\b[^>]*\/?>/gi, "\t")
    .replace(/<\/(w:p|a:p|text:p|table:table-row)>/gi, "\n")
    .replace(/<text:tab\b[^>]*\/?>/gi, "\t")
    .replace(/<[^>]+>/g, " ");
  return decodeXml(withBreaks).split(/\r?\n/).map((line) => line.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
}

function zipEntries(content: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;
  while (offset + 46 <= content.length && entries.length < maxArchiveEntries + 1) {
    const signature = content.readUInt32LE(offset);
    if (signature !== 0x02014b50) { offset += 1; continue; }
    const compression = content.readUInt16LE(offset + 10);
    const compressedSize = content.readUInt32LE(offset + 20);
    const size = content.readUInt32LE(offset + 24);
    const nameLength = content.readUInt16LE(offset + 28);
    const extraLength = content.readUInt16LE(offset + 30);
    const commentLength = content.readUInt16LE(offset + 32);
    const localOffset = content.readUInt32LE(offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > content.length) break;
    const name = content.toString("utf8", offset + 46, offset + 46 + nameLength).replaceAll("\\", "/");
    entries.push({ name, size, directory: name.endsWith("/"), compression, compressedSize, localOffset });
    offset = end;
  }
  return entries;
}

function readZipEntry(content: Buffer, entry: ZipEntry, maxBytes = 6_000_000): Buffer | null {
  if (entry.size > maxBytes || entry.localOffset + 30 > content.length || content.readUInt32LE(entry.localOffset) !== 0x04034b50) return null;
  const nameLength = content.readUInt16LE(entry.localOffset + 26);
  const extraLength = content.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > content.length) return null;
  const packed = content.subarray(start, end);
  if (entry.compression === 0) return Buffer.from(packed);
  if (entry.compression === 8) {
    try { return inflateRawSync(packed, { maxOutputLength: maxBytes }); } catch { return null; }
  }
  return null;
}

function tarEntries(content: Buffer): PreviewArchiveEntry[] {
  const entries: PreviewArchiveEntry[] = [];
  let offset = 0;
  while (offset + 512 <= content.length && entries.length < maxArchiveEntries + 1) {
    const block = content.subarray(offset, offset + 512);
    if (block.every((byte) => byte === 0)) break;
    const readString = (start: number, end: number) => block.toString("utf8", start, end).replace(/\0.*$/, "");
    const name = `${readString(345, 500)}${readString(345, 500) ? "/" : ""}${readString(0, 100)}`;
    const size = Number.parseInt(readString(124, 136).trim() || "0", 8) || 0;
    const directory = block[156] === 53 || name.endsWith("/");
    entries.push({ name, size, directory });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

export function listArchiveEntries(content: Buffer, originalName: string): { entries: PreviewArchiveEntry[]; truncated: boolean } {
  const lower = originalName.toLowerCase();
  let entries: PreviewArchiveEntry[];
  if (lower.endsWith(".zip")) entries = zipEntries(content);
  else {
    let tar = content;
    if (lower.endsWith(".tgz") || lower.endsWith(".tar.gz")) {
      try { tar = gunzipSync(content, { maxOutputLength: 100_000_000 }); } catch { return { entries: [], truncated: false }; }
    }
    entries = tarEntries(tar);
  }
  return { entries: entries.slice(0, maxArchiveEntries), truncated: entries.length > maxArchiveEntries };
}

function officeFormat(extension: string): "document" | "presentation" | "spreadsheet" {
  if (["ppt", "pptx"].includes(extension)) return "presentation";
  if (["xls", "xlsx", "ods"].includes(extension)) return "spreadsheet";
  return "document";
}

function modernOfficeSections(content: Buffer, extension: string): { title: string; lines: string[] }[] {
  const entries = zipEntries(content);
  const readXml = (entry: ZipEntry | undefined) => entry ? readZipEntry(content, entry)?.toString("utf8") ?? "" : "";
  if (extension === "docx") {
    return [{ title: "Document", lines: xmlLines(readXml(entries.find((entry) => entry.name === "word/document.xml"))) }];
  }
  if (extension === "pptx") {
    return entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).slice(0, 250)
      .map((entry, index) => ({ title: `Diapositive ${index + 1}`, lines: xmlLines(readXml(entry)) }));
  }
  if (extension === "xlsx") {
    const sharedXml = readXml(entries.find((entry) => entry.name === "xl/sharedStrings.xml"));
    const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) => xmlLines(match[1]).join(" "));
    return entries.filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).slice(0, 100).map((entry, index) => {
      const xml = readXml(entry);
      const lines = [...xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)].slice(0, 5_000).map((match) => {
        const ref = /\br="([^"]+)"/.exec(match[1])?.[1] ?? "Cellule";
        const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(match[2])?.[1] ?? xmlLines(match[2]).join(" ");
        const value = /\bt="s"/.test(match[1]) ? shared[Number(raw)] ?? raw : decodeXml(raw);
        return `${ref}  ·  ${value}`;
      });
      return { title: `Feuille ${index + 1}`, lines };
    });
  }
  if (["odt", "ods"].includes(extension)) return [{ title: extension === "ods" ? "Feuille" : "Document", lines: xmlLines(readXml(entries.find((entry) => entry.name === "content.xml"))) }];
  return [];
}

export async function canRenderOfficePdf(): Promise<boolean> {
  try { await access(libreOfficePath, constants.X_OK); return true; } catch { return false; }
}

export async function renderOfficePdf(resource: EntResource, content: Buffer): Promise<Buffer> {
  const extension = extensionOf(resource.originalName);
  const directory = await mkdtemp(path.join(tmpdir(), "sioverse-office-"));
  const input = path.join(directory, `document.${extension}`);
  try {
    await writeFile(input, content, { flag: "wx" });
    await execFileAsync(libreOfficePath, [`-env:UserInstallation=file://${path.join(directory, "profile")}`, "--headless", "--norestore", "--convert-to", "pdf", "--outdir", directory, input], { timeout: 30_000, maxBuffer: 2_000_000 });
    return await readFile(path.join(directory, "document.pdf"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function buildEntPreview(resource: EntResource, content: Buffer): Promise<EntPreviewData> {
  const extension = extensionOf(resource.originalName);
  if (resource.mimeType === "text/plain") {
    const text = content.toString("utf8");
    const sliced = text.slice(0, maxTextCharacters);
    return { kind: "text", language: extension || "text", lines: sliced.split(/\r?\n/), truncated: text.length > sliced.length };
  }
  if (resource.kind === "ARCHIVE" || ["zip", "tar", "tgz", "gz"].includes(extension)) {
    return { kind: "archive", ...listArchiveEntries(content, resource.originalName ?? "archive.zip") };
  }
  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx", "odt", "ods"].includes(extension)) {
    const sections = ["docx", "pptx", "xlsx", "odt", "ods"].includes(extension) ? modernOfficeSections(content, extension) : [];
    return { kind: "office", format: officeFormat(extension), sections, truncated: sections.some((section) => section.lines.length >= 5_000), pdfAvailable: await canRenderOfficePdf() };
  }
  return { kind: "none", message: "Ce format peut être téléchargé, mais il ne possède pas encore d’aperçu intégré." };
}
