import path from "node:path";
import type { ResourceKind } from "./ent";

export const entMimeTypes: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  txt: "text/plain", md: "text/plain", py: "text/plain", java: "text/plain", js: "text/plain",
  ts: "text/plain", jsx: "text/plain", tsx: "text/plain", html: "text/plain", css: "text/plain",
  json: "text/plain", xml: "text/plain", sql: "text/plain", csv: "text/plain", yml: "text/plain", yaml: "text/plain",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
  pkt: "application/octet-stream", loo: "application/octet-stream", iml: "text/plain",
  zip: "application/zip", tar: "application/x-tar", tgz: "application/gzip", gz: "application/gzip",
};

export function fileExtension(name: string): string {
  return path.extname(name).slice(1).toLowerCase();
}

export function validFileContent(extension: string, content: Buffer): boolean {
  if (!content.length) return false;
  const header = content.toString("ascii", 0, 8);
  if (extension === "pdf") return content.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === "png") return content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === "jpg" || extension === "jpeg") return content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  if (extension === "webp") return header.slice(0, 4) === "RIFF" && content.toString("ascii", 8, 12) === "WEBP";
  if (["zip", "docx", "pptx", "xlsx", "odt", "ods"].includes(extension)) return ["504b0304", "504b0506", "504b0708"].includes(content.subarray(0, 4).toString("hex"));
  if (["tgz", "gz"].includes(extension)) return content[0] === 0x1f && content[1] === 0x8b;
  if (extension === "tar") {
    if (content.length < 1024 || content.length % 512 !== 0) return false;
    const block = content.subarray(0, 512);
    if (block.every((byte) => byte === 0)) return true;
    const expected = Number.parseInt(block.toString("ascii", 148, 156).replaceAll("\0", " ").trim(), 8);
    const actual = block.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    return Number.isFinite(expected) && expected === actual;
  }
  if (["doc", "ppt", "xls"].includes(extension)) return content.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (entMimeTypes[extension] === "text/plain") return !content.subarray(0, Math.min(content.length, 4096)).includes(0);
  return true;
}

export function isArchive(name: string): boolean {
  return /\.(zip|tar|tar\.gz|tgz)$/i.test(name);
}

export function resourceKindForFile(name: string): ResourceKind {
  if (isArchive(name)) return "ARCHIVE";
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_-]+/g, " ");
  if (/corrig|solution|reponse/.test(normalized)) return "CORRECTION";
  if (/fiche|resume|memo/.test(normalized)) return "CHEATSHEET";
  if (/exercice|\bexo\b|\btp\d*\b|\btd\d*\b|activit|devoir/.test(normalized)) return "EXERCISE";
  return "COURSE";
}
