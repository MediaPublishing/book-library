#!/usr/bin/env node
import { createHash } from "node:crypto";
import fsSync from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const pluginManifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const version = packageManifest.version;

if (version !== pluginManifest.version) {
  throw new Error(`Version mismatch: package.json ${version}, manifest.json ${pluginManifest.version}`);
}

const releaseFiles = ["main.js", "manifest.json", "styles.css"];
const releaseDir = path.join(root, "site", "download", version);
const zipName = `book-library-${version}.zip`;
const zipPath = path.join(root, "site", "download", zipName);
const force = process.argv.includes("--force");

await mkdir(releaseDir, { recursive: true });
for (const file of releaseFiles) {
  await copyFile(path.join(root, file), path.join(releaseDir, file));
}

// A fixed timestamp keeps rebuilt release archives byte-stable for identical inputs.
const zipEpoch = new Date(Date.UTC(1980, 0, 1));
const zip = new JSZip();
for (const file of releaseFiles) {
  zip.file(file, await readFile(path.join(releaseDir, file)), { date: zipEpoch, unixPermissions: 0o644 });
}
let zipBuffer;
if (fsSync.existsSync(zipPath) && !force) {
  zipBuffer = await readFile(zipPath);
} else {
  zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
  });
}
await writeFile(zipPath, zipBuffer);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

const checksums = [];
const checksumPaths = [...releaseFiles.map((file) => path.join(releaseDir, file)), zipPath];
for (const [index, checksumPath] of checksumPaths.entries()) {
  const buffer = await readFile(checksumPath);
  const label = index < releaseFiles.length ? releaseFiles[index] : path.join("..", zipName);
  checksums.push(`${sha256(buffer)}  ${label}`);
}
await writeFile(path.join(releaseDir, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`, "utf8");

console.log(JSON.stringify({
  version,
  releaseDir: path.relative(root, releaseDir),
  zip: path.relative(root, zipPath),
  zipSha256: sha256(zipBuffer),
}, null, 2));
