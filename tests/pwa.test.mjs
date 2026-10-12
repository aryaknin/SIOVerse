import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { sioverseManifest } from "../src/app/manifest.ts";

test("le manifeste PWA contient les formats requis par Android", async () => {
  const data = sioverseManifest();
  assert.equal(data.display, "standalone");
  assert.equal(data.start_url, "/");
  assert.ok(data.icons?.some((icon) => icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(data.icons?.some((icon) => icon.sizes === "512x512" && icon.type === "image/png"));
  await access("public/icons/sioverse-192.png");
  await access("public/icons/sioverse-512.png");
});

test("le service worker possède un vrai gestionnaire de cache", async () => {
  const worker = await readFile("public/sw.js", "utf8");
  assert.match(worker, /addEventListener\("fetch"/);
  assert.match(worker, /caches\.open/);
});
