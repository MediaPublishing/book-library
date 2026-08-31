#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { buildSync } from "esbuild";

const root = process.cwd();
const vaultArgument = process.argv.indexOf("--vault");
const vault = vaultArgument >= 0 && process.argv[vaultArgument + 1]
  ? path.resolve(process.argv[vaultArgument + 1])
  : path.join(root, "fixtures/vault");
const settingsPath = path.join(vault, ".obsidian/plugins/book-library/data.json");

if (!fs.existsSync(settingsPath)) {
  console.error(`Book Library settings not found: ${settingsPath}`);
  process.exit(1);
}

function option(name, fallback) {
  const index = process.argv.indexOf("--" + name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const modules = {};
for (const name of ["related", "util", "catalog", "topics", "audiobooks"]) {
  const compiled = buildSync({
    entryPoints: [path.join(root, "src", `${name}.ts`)],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  modules[name] = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
}

const { normalizeDisplayText } = modules["util"];
const { computeRelatedBooks } = modules["related"];
const { assignCatalogFileNames, renderCatalogRecord } = modules["catalog"];
const { writeBookTopicMocs } = modules["topics"];
const { writeAudiobookCatalog } = modules["audiobooks"];
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const defaults = {
  catalogDir: "_catalog",
  coversDir: "_catalog/covers",
  markdownDir: "_books",
  wikiDir: "_wiki",
  audiobookCatalogDir: "_audiobooks",
};
for (const [key, value] of Object.entries(defaults)) {
  if (settings[key] === null || settings[key] === undefined) settings[key] = value;
}

const catalogDir = path.join(vault, settings.catalogDir);
const indexPath = path.join(catalogDir, ".book-library-index.json");
if (!fs.existsSync(indexPath)) {
  console.error(`Book index not found: ${indexPath}`);
  process.exit(1);
}

const bookIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));

const language = settings.language === "de" ? "de" : "en";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const indexBackupPath = `${indexPath}.pre-${stamp}`;
if (!fs.existsSync(indexBackupPath)) fs.copyFileSync(indexPath, indexBackupPath);
let repairedBooks = 0;
const titles = {};
const catalogPaths = {};
for (const [hash, record] of Object.entries(bookIndex.entries)) {
  const repaired = {
    ...record,
    title: normalizeDisplayText(record.title),
    author: normalizeDisplayText(record.author),
    year: normalizeDisplayText(record.year),
    language: normalizeDisplayText(record.language),
    publisher: normalizeDisplayText(record.publisher),
    summary: normalizeDisplayText(record.summary),
    tags: [...new Set((record.tags || []).map((tag) => normalizeDisplayText(tag)).filter(Boolean))],
  };
  if (JSON.stringify(repaired) !== JSON.stringify(record)) repairedBooks += 1;
  bookIndex.entries[hash] = repaired;
}

const assignedPaths = assignCatalogFileNames(
  Object.values(bookIndex.entries).map(({ catalogPath: _legacyPath, ...record }) => record),
  (record) => record.hash
);
const backupDir = path.join(catalogDir, ".book-library-superseded-notes");
let archivedNotes = 0;
for (const [hash, record] of Object.entries(bookIndex.entries)) {
  const from = record.catalogPath || "";
  const to = assignedPaths[hash];
  if (from && from !== to) {
    const source = path.join(catalogDir, path.basename(from));
    if (fs.existsSync(source)) {
      fs.mkdirSync(backupDir, { recursive: true });
      let destination = path.join(backupDir, `${hash}--${path.basename(from)}`);
      let suffix = 2;
      while (fs.existsSync(destination)) {
        destination = path.join(backupDir, `${hash}--${path.basename(from, ".md")} (${suffix}).md`);
        suffix += 1;
      }
      fs.renameSync(source, destination);
      archivedNotes += 1;
    }
  }
  record.catalogPath = to;
  titles[hash] = record.title;
  catalogPaths[hash] = to;
}

for (const record of Object.values(bookIndex.entries)) {
  const related = computeRelatedBooks(record, Object.values(bookIndex.entries));
  if (JSON.stringify(related) !== JSON.stringify(record.related)) repairedBooks += 1;
  record.related = related;
  const notePath = path.join(catalogDir, path.basename(record.catalogPath || `${record.hash}.md`));
  fs.writeFileSync(notePath, renderCatalogRecord(record, {
    language,
    wikiDir: settings.wikiDir,
    coversDir: settings.coversDir,
    titles,
    catalogPaths,
    amazonUrlTemplate: settings.amazonUrlTemplate,
    goodreadsUrlTemplate: settings.goodreadsUrlTemplate,
    topicsDir: path.posix.join(settings.catalogDir || "_catalog", "topics"),
  }), "utf8");
}

writeBookTopicMocs(
  Object.values(bookIndex.entries),
  path.join(catalogDir, "topics"),
  language,
  settings.catalogDir
);
fs.writeFileSync(indexPath, JSON.stringify(bookIndex, null, 2) + "\n", "utf8");

const audiobookDir = path.join(vault, settings.audiobookCatalogDir);
const audiobookIndexPath = path.join(audiobookDir, ".book-library-audiobook-index.json");
let repairedAudiobooks = 0;
if (fs.existsSync(audiobookIndexPath)) {
  const audiobookBackupPath = `${audiobookIndexPath}.pre-${stamp}`;
  if (!fs.existsSync(audiobookBackupPath)) fs.copyFileSync(audiobookIndexPath, audiobookBackupPath);
  const audiobookIndex = JSON.parse(fs.readFileSync(audiobookIndexPath, "utf8"));
  for (const [id, record] of Object.entries(audiobookIndex.entries)) {
    const repaired = {
      ...record,
      sourceName: normalizeDisplayText(record.sourceName),
      storagePath: normalizeDisplayText(record.storagePath || record.privateMegaPath),
      privateMegaPath: normalizeDisplayText(record.privateMegaPath),
      title: normalizeDisplayText(record.title),
      author: normalizeDisplayText(record.author),
      narrator: normalizeDisplayText(record.narrator),
      duration: normalizeDisplayText(record.duration),
      language: normalizeDisplayText(record.language),
      year: normalizeDisplayText(record.year),
      category: (record.category || []).map(normalizeDisplayText).filter(Boolean),
      synopsis: normalizeDisplayText(record.synopsis),
      synopsisSource: normalizeDisplayText(record.synopsisSource),
    };
    if (JSON.stringify(repaired) !== JSON.stringify(record)) repairedAudiobooks += 1;
    audiobookIndex.entries[id] = repaired;
  }
  writeAudiobookCatalog(audiobookIndex, audiobookDir, bookIndex, {
    language,
    technicalExpanded: Boolean(settings.technicalDetailsExpanded),
  });
}

console.log(JSON.stringify({
  vault,
  booksTotal: Object.keys(bookIndex.entries).length,
  repairedBooks,
  archivedNotes,
  topicsTotal: fs.readdirSync(path.join(catalogDir, "topics")).filter((name) => name.endsWith(".md")).length,
  audiobookIndexFound: fs.existsSync(audiobookIndexPath),
  repairedAudiobooks,
}, null, 2));
