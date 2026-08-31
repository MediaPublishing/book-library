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

function cleanToken(value) {
  if (!value) return "";
  return value
    .replace(/^["'_\s]+|["'_\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function folderTitle(file) {
  const dirs = (file || "").split("/");
  if (dirs.length >= 2) {
    const parent = dirs[dirs.length - 2];
    if (parent && /[A-Za-z0-9\u00C0-\u017F]/.test(parent) && !/^\d+$/.test(parent)) {
      return parent.trim();
    }
  }
  return "";
}

function folderParentAuthor(file) {
  const dirs = (file || "").split("/");
  if (dirs.length >= 3) {
    const parent = dirs[dirs.length - 3];
    if (parent && /[A-Za-z0-9\u00C0-\u017F]/.test(parent) && !/^\d+$/.test(parent)) {
      return cleanDisplayAuthor(parent);
    }
  }
  return "";
}

const technicalTitlePattern =
  /\.(?:indd|qxp|lwp|pmd|fm(?:d)?|ai|psd|docx?|xlsx?|pptx?|pdf|epub|mobi|azw3?)$/i;

function isTechnicalTitle(value) {
  return typeof value === "string" && technicalTitlePattern.test(value.trim());
}

function titleLooksProduced(value) {
  return /^(?:[0-9]{3}[-_\s]?[0-9]{3}|Todd_|TempFile|Eric-Jorgenson_)/i.test(value || "");
}

function isPractitionerPlaceholderAuthor(value) {
  return /^(sachgupt|tonyphip|unknown|unbekannt|pdf|epub|scan|adobe|acrobat|quarkxpress|in\.?design|microsoft)/i
    .test((value || "").trim());
}

function cleanDisplayTitle(value) {
  return cleanToken(String(value || "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/[_]+/g, " "))
    .replace(/\.(?:epub|pdf|mobi|azw3?|indd|qxp|lwp)$/i, "")
    .trim();
}

function cleanDisplayAuthor(value) {
  const author = cleanToken(String(value || "").replace(/\s*\([^)]*\)\s*$/g, ""));
  if (isPractitionerPlaceholderAuthor(author)) return "";
  return author;
}

function suggestFromFile(record) {
  const file = record.file || "";
  const folded = folderTitle(file);
  const fromFolder = cleanToken(folded);
  if (!fromFolder) return null;

  // Special-case known Adobe author-prefixed filenames, e.g.
  // Eric-Jorgenson_The-Almanack-of-Naval-Ravikant.indd
  const authorTitle = (record.title || "").match(/^([A-Za-z]+-[A-Za-z]+)_(.+?)\.(?:indd|pdf|qxp|lwp)$/i);
  if (authorTitle && authorTitle[2]) {
    const author = authorTitle[1].replace(/-/g, " ");
    const title = authorTitle[2]
      .replace(/[_]+/g, " ")
      .replace(/-/g, " ")
      .replace(/\s+\(?\d*\)?\s*$/g, "")
      .trim();
    if (title && !/^(unknown|unbekannt)$/i.test(title)) {
      return {
        title: cleanDisplayTitle(title),
        author: cleanDisplayAuthor(author),
        source: "filename author prefix",
      };
    }
  }

  let title = fromFolder;
  let author = "";
  const match = fromFolder.match(/^\s*(.+?)\s*[-–—]\s*([^()[\]]+)$/);
  if (match) {
    const candidate = cleanToken(match[2]);
    if (candidate && !/^\d+$/.test(candidate) && !isPractitionerPlaceholderAuthor(candidate)) {
      title = cleanToken(match[1]);
      author = candidate;
    }
  }
  return {
    title: cleanDisplayTitle(title),
    author: cleanDisplayAuthor(author),
    source: "parent folder",
  };
}

function hasPlausibleIsbn(value) {
  const isbn = String(value || "").replace(/[\s-]/g, "");
  return /^(?:97[89][0-9]{10}|[0-9]{10})$/.test(isbn);
}

async function resolveOpenLibrary(record) {
  const isbn = String(record.isbn || "").replace(/[\s-]/g, "");
  if (!hasPlausibleIsbn(isbn)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    const entry = data[`ISBN:${isbn}`];
    if (!entry?.title) return null;
    const authors = Array.isArray(entry.authors) ? entry.authors.map((a) => a.name).join(", ") : "";
    return { title: cleanDisplayTitle(entry.title), author: cleanDisplayAuthor(authors), source: "Open Library ISBN" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function shouldRepair(record) {
  const title = (record.title || "").trim();
  const author = (record.author || "").trim();
  return (
    isTechnicalTitle(title) ||
    titleLooksProduced(title) ||
    /^(sachgupt|tonyphip)$/i.test(author)
  );
}

const entries = Object.entries(bookIndex.entries);
const repairedHashes = [];
const failedHashes = [];
for (const [hash, record] of entries) {
  if (!shouldRepair(record)) continue;
  const previousTitle = normalizeDisplayText(record.title);
  const previousAuthor = normalizeDisplayText(record.author);
  const fromOpenLibrary = await resolveOpenLibrary(record);
  const fromFile = suggestFromFile(record);
  const source = fromOpenLibrary || fromFile;

  if (!source?.title) {
    failedHashes.push(hash);
    continue;
  }

  const newTitle = cleanDisplayTitle(source.title);
  const fallbackAuthor = folderParentAuthor(record.file);
  const newAuthor = cleanDisplayAuthor(source.author) || fallbackAuthor;
  if (!newTitle) {
    failedHashes.push(hash);
    continue;
  }

  record.title = newTitle;
  if (newAuthor) record.author = newAuthor;
  record.aliases = Array.isArray(record.aliases) ? record.aliases.filter(Boolean) : [];
  if (previousTitle && previousTitle !== newTitle && !record.aliases.includes(previousTitle)) {
    record.aliases.push(previousTitle);
  }
  record.metadataSource = `repaired from file path: ${source.source}`;
  repairedHashes.push(hash);
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
}

const titles = {};
const catalogPaths = {};
for (const record of Object.values(bookIndex.entries)) {
  const related = computeRelatedBooks(record, Object.values(bookIndex.entries));
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
  titles[record.hash] = record.title;
  catalogPaths[record.hash] = record.catalogPath;
}

writeBookTopicMocs(
  Object.values(bookIndex.entries),
  path.join(catalogDir, "topics"),
  language,
  settings.catalogDir
);
fs.writeFileSync(indexPath, JSON.stringify(bookIndex, null, 2) + "\n", "utf8");

console.log(JSON.stringify({
  vault,
  backup: indexBackupPath,
  repairedHashes,
  failedHashes,
  archivedNotes,
}, null, 2));
