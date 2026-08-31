import * as fs from "node:fs";
import * as path from "node:path";
import {
  assignCatalogFileNames,
  catalogFileName,
  catalogLinkTarget,
  renderCatalogRecord,
} from "../src/catalog";
import { writeAudiobookCatalog } from "../src/audiobooks";
import type { AudiobookIndex, BookIndex, BookRecord } from "../src/types";

const root = process.cwd();
const apply = process.argv.includes("--apply");
const catalogDir = option("--catalog") || path.join(root, "fixtures/vault/_catalog");
const audiobookDir = option("--audiobooks") || path.join(root, "fixtures/vault/_audiobooks");
const vaultRoot = path.dirname(catalogDir);
const indexPath = path.join(catalogDir, ".book-library-index.json");
const audiobookIndexPath = path.join(audiobookDir, ".book-library-audiobook-index.json");

if (!fs.existsSync(indexPath)) {
  throw new Error("Book-Index nicht gefunden: " + indexPath);
}

const books = readJson<BookIndex>(indexPath);
const bookRecords = Object.values(books.entries);
const bookFileNames = assignCatalogFileNames(bookRecords, (record) => record.hash);
for (const record of bookRecords) record.catalogPath = bookFileNames[record.hash];

const audio = fs.existsSync(audiobookIndexPath) ? readJson<AudiobookIndex>(audiobookIndexPath) : null;
if (audio) {
  const filenames = assignCatalogFileNames(Object.values(audio.entries), (record) => record.id);
  for (const record of Object.values(audio.entries)) {
    record.catalogPath = path.posix.join(path.basename(audiobookDir), filenames[record.id]);
  }
}

const titles = Object.fromEntries(bookRecords.map((record) => [record.hash, record.title]));
const catalogPaths = Object.fromEntries(bookRecords.map((record) => [record.hash, catalogFileName(record)]));
const workspacePath = path.join(vaultRoot, ".obsidian/workspace.json");
const targetBookNotes = bookRecords.map((record) => path.join(catalogDir, catalogFileName(record)));
const targetAudiobookNotes = audio
  ? Object.values(audio.entries).map((record) => path.join(audiobookDir, catalogFileName({
      title: record.title,
      author: record.author,
      catalogPath: path.posix.basename(record.catalogPath),
    })))
  : [];
const legacyBookNotes = legacyHashNotes(catalogDir);
const legacyAudioNotes = audio ? legacyHashNotes(audiobookDir) : [];
const supersededBookNotes = supersededManagedNotes(catalogDir, new Set(targetBookNotes));
const plan = {
  apply,
  books: {
    index: relative(indexPath),
    entries: bookRecords.length,
    targetNotes: targetBookNotes.length,
    supersededManagedNotes: supersededBookNotes.length,
    legacyHashNotes: legacyBookNotes.length,
  },
  audiobooks: audio
    ? {
        index: relative(audiobookIndexPath),
        entries: Object.keys(audio.entries).length,
        targetNotes: targetAudiobookNotes.length,
        legacyHashNotes: legacyAudioNotes.length,
      }
    : null,
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

assertNoCollision(targetBookNotes, "Buch-Katalog");
assertNoCollision(targetAudiobookNotes, "Audiobook-Katalog");
archiveManagedNotes(catalogDir, supersededBookNotes);
backupFile(indexPath);
for (const record of bookRecords) {
  fs.writeFileSync(
    path.join(catalogDir, catalogFileName(record)),
    renderCatalogRecord(record, {
      language: "de",
      wikiDir: "_wiki",
      titles,
      catalogPaths,
    }),
    "utf8"
  );
}
fs.writeFileSync(indexPath, JSON.stringify(books, null, 2) + "\n", "utf8");
archiveLegacyNotes(catalogDir, legacyBookNotes);

if (audio) {
  backupFile(audiobookIndexPath);
  writeAudiobookCatalog(audio, audiobookDir, books);
  fs.writeFileSync(audiobookIndexPath, JSON.stringify(audio, null, 2) + "\n", "utf8");
  archiveLegacyNotes(audiobookDir, legacyAudioNotes);
}

const rewrittenLinks = rewriteExternalBookLinks(path.dirname(catalogDir), catalogPaths);
const workspaceReferences = rewriteWorkspaceState(workspacePath, bookRecords, audio ? Object.values(audio.entries) : []);
const receipt = {
  ...plan,
  apply: true,
  rewrittenExternalBookLinks: rewrittenLinks,
  archivedBookNotes: legacyBookNotes.length,
  archivedSupersededBookNotes: supersededBookNotes.length,
  archivedAudiobookNotes: legacyAudioNotes.length,
  rewrittenWorkspaceReferences: workspaceReferences,
  sample: bookRecords.slice(0, 5).map((record) => ({
    title: record.title,
    author: record.author,
    catalogPath: record.catalogPath,
  })),
};
const receiptPath = path.join(
  root,
  "docs/goals/book-library-completion-gauntlet/receipts/catalog-display-name-migration-2026-08-21.json"
);
fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ ...receipt, receipt: relative(receiptPath) }, null, 2));

function option(name: string): string | "" {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function legacyHashNotes(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => /^[a-f0-9]{64}\.md$/i.test(name))
    .map((name) => path.join(directory, name));
}

function supersededManagedNotes(directory: string, activeTargets: Set<string>): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && !activeTargets.has(path.join(directory, entry.name)))
    .map((entry) => path.join(directory, entry.name))
    .filter((file) => fs.readFileSync(file, "utf8").startsWith("---\nkind: book\n"));
}

function assertNoCollision(files: string[], label: string): void {
  const duplicate = files.find((file, index) => files.indexOf(file) !== index);
  if (duplicate) throw new Error(`${label}: doppelter Zielname ${duplicate}`);
  for (const file of files) {
    if (fs.existsSync(file) && !isManagedCatalogNote(file)) {
      throw new Error(`${label}: Ziel existiert bereits und wird nicht überschrieben: ${file}`);
    }
  }
}

function isManagedCatalogNote(file: string): boolean {
  const header = fs.readFileSync(file, "utf8").slice(0, 256);
  return header.startsWith("---\nkind: book\n") || header.startsWith("---\nkind: audiobook\n");
}

function backupFile(file: string): void {
  const destination = `${file}.before-display-name-migration-2026-08-21.bak`;
  if (!fs.existsSync(destination)) fs.copyFileSync(file, destination, fs.constants.COPYFILE_EXCL);
}

function archiveLegacyNotes(directory: string, notes: string[]): void {
  if (notes.length === 0) return;
  const archive = path.join(directory, ".book-library-legacy-hash-notes");
  fs.mkdirSync(archive, { recursive: true });
  for (const note of notes) {
    const destination = path.join(archive, path.basename(note));
    if (fs.existsSync(destination)) {
      throw new Error(`Archivziel existiert bereits: ${destination}`);
    }
    fs.renameSync(note, destination);
  }
}

function archiveManagedNotes(directory: string, notes: string[]): void {
  if (notes.length === 0) return;
  const archive = path.join(directory, ".book-library-legacy-hash-notes");
  fs.mkdirSync(archive, { recursive: true });
  for (const note of notes) {
    let destination = path.join(archive, path.basename(note));
    if (fs.existsSync(destination)) destination = path.join(archive, `${path.basename(note, ".md")}-${Date.now()}.md`);
    fs.renameSync(note, destination);
  }
}

function rewriteExternalBookLinks(vaultRoot: string, paths: Record<string, string>): number {
  let rewritten = 0;
  const stack = [vaultRoot];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".book-library-legacy-hash-notes") continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md") || absolute.startsWith(catalogDir + path.sep)) continue;
      const before = fs.readFileSync(absolute, "utf8");
      const after = before.replace(/\[\[(?:_catalog\/)?([a-f0-9]{64})(?=(?:#[^|\]]*)?(?:\||\]\]))/gi, (match, hash: string) => {
        const catalogPath = paths[hash];
        if (!catalogPath) return match;
        rewritten += 1;
        return `[[${catalogLinkTarget(catalogPath, "_catalog")}`;
      });
      if (after !== before) fs.writeFileSync(absolute, after, "utf8");
    }
  }
  return rewritten;
}

function rewriteWorkspaceState(workspace: string, records: BookRecord[], audioRecords: AudiobookIndex["entries"][string][]): number {
  if (!fs.existsSync(workspace)) return 0;
  const bookPaths = Object.fromEntries(records.map((record) => [
    `_catalog/${record.hash}.md`,
    { path: `_catalog/${catalogFileName(record)}`, title: record.title },
  ]));
  const audioPaths = Object.fromEntries(audioRecords.map((record) => [
    `_audiobooks/${record.id}.md`,
    { path: record.catalogPath, title: record.title },
  ]));
  const titlesById = Object.fromEntries([
    ...records.map((record) => [record.hash, record.title]),
    ...audioRecords.map((record) => [record.id, record.title]),
  ]);
  const document = readJson<unknown>(workspace);
  let rewritten = 0;
  const walk = (value: unknown, key = ""): unknown => {
    if (Array.isArray(value)) {
      return value
        .map((entry) => walk(entry))
        .filter((entry) => {
          const staleHashNote = typeof entry === "string" && /^_(?:catalog|audiobooks)\/[a-f0-9]{64}\.md$/i.test(entry);
          if (staleHashNote) rewritten += 1;
          return !staleHashNote;
        });
    }
    if (!value || typeof value !== "object") {
      if (typeof value !== "string") return value;
      const mapped = bookPaths[value] || audioPaths[value];
      if (mapped) {
        rewritten += 1;
        return mapped.path;
      }
      if (key === "title" && titlesById[value]) {
        rewritten += 1;
        return titlesById[value];
      }
      return value;
    }
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, walk(childValue, childKey)]));
  };
  const migrated = walk(document);
  if (rewritten) {
    backupFile(workspace);
    fs.writeFileSync(workspace, JSON.stringify(migrated, null, 2) + "\n", "utf8");
  }
  return rewritten;
}

function relative(value: string): string {
  return path.relative(root, value) || ".";
}
