import * as fs from "fs";
import * as path from "path";
import { assignCatalogFileNames, catalogFileName, catalogLinkTarget } from "./catalog";
import type { Language } from "./i18n";
import { normalizeDisplayText, sha256, slugify } from "./util";
import type { AudiobookIndex, AudiobookMediaType, AudiobookRecord, AudiobookSourceVisibility, BookIndex, ManualAudiobookInput } from "./types";

interface StagingItem {
  id: string;
  sourceName: string;
  storagePath: string;
  mediaType: AudiobookMediaType;
  title: string;
  author?: string;
  sourceStatus: "verified-storage-path" | "verified-local-path";
}

export interface LocalAudiobookScanOptions {
  libraryPath: string;
  catalogDir: string;
  previousIndex?: AudiobookIndex | null;
}

interface StagingFile {
  generatedAt: string;
  source: { provider?: string; visibility?: AudiobookSourceVisibility; root: string };
  items: StagingItem[];
}

interface MatchFile {
  items: Array<{
    id: string;
    matchStatus: "matched" | "unmatched" | "ambiguous";
    match?: { hash: string; author: string; title: string; hasSynopsis: boolean } | null;
  }>;
}

interface AudioInventoryFacts {
  audioFormats: string[];
  audioFileCount: number;
  audioBytes: number;
  audioLastModified: string;
}

const AUDIO_EXTENSIONS = new Set([".aac", ".flac", ".m4a", ".m4b", ".mp3", ".ogg", ".opus", ".wav"]);

export function parseStorageAudioFacts(rawInventory: string, root: string): Record<string, AudioInventoryFacts> {
  const facts: Record<string, AudioInventoryFacts> = {};
  const headerPrefix = "/" + root + "/";
  const filePattern = /^----\s+\d+\s+(\d+)\s+(\S+)\s+(.+)$/;
  let currentPath = "";
  for (const line of rawInventory.split(/\r?\n/)) {
    if (line.startsWith(headerPrefix) && line.endsWith(":")) {
      const relative = line.slice(headerPrefix.length, -1);
      const topLevelName = relative.split("/")[0];
      currentPath = root + "/" + topLevelName;
      facts[currentPath] ||= { audioFormats: [], audioFileCount: 0, audioBytes: 0, audioLastModified: "" };
      continue;
    }
    if (!currentPath) continue;
    const file = line.match(filePattern);
    if (!file) continue;
    const extension = path.extname(file[3]).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(extension)) continue;
    const entry = facts[currentPath] ||= { audioFormats: [], audioFileCount: 0, audioBytes: 0, audioLastModified: "" };
    if (!entry.audioFormats.includes(extension.slice(1).toUpperCase())) entry.audioFormats.push(extension.slice(1).toUpperCase());
    entry.audioFileCount += 1;
    entry.audioBytes += Number(file[1]);
    if (file[2] > entry.audioLastModified) entry.audioLastModified = file[2];
  }
  return facts;
}

interface AudiobookEnrichment {
  storagePath: string;
  /** Legacy enrichment input for a provider-specific private URL. */
  legacyPrivateUrl?: string;
  title?: string;
  author?: string;
  narrator?: string;
  duration?: string;
  language?: string;
  year?: string;
  category?: string[];
  synopsis?: string;
  synopsisSource?: string;
  synopsisStatus?: "inventory-note" | "verified";
  sourceMetadataFiles?: string[];
  localBookSources?: string[];
  publicMetadataSources?: string[];
  metadataStatus?: "inventory-indexed" | "matched-book" | "needs-enrichment" | "enriched-local-metadata" | "enriched-public-metadata";
}

interface AudiobookEnrichmentFile {
  items: AudiobookEnrichment[];
}

export interface AudiobookImportOptions {
  catalogDir: string;
  inventoryReadback: string;
  staging: StagingFile;
  matches: MatchFile;
  books: BookIndex;
  rawInventory: string;
  enrichments?: AudiobookEnrichmentFile;
  /** Preserve assigned local assets and explicitly created external shares. */
  previousIndex?: AudiobookIndex | null;
}

export function buildAudiobookIndex(options: AudiobookImportOptions): AudiobookIndex {
  const matches = new Map(options.matches.items.map((item) => [item.id, item]));
  const sourceFacts = parseStorageAudioFacts(options.rawInventory, options.staging.source.root);
  const enrichments = new Map((options.enrichments?.items || []).map((item) => [item.storagePath, item]));
  const entries: Record<string, AudiobookRecord> = {};
  for (const item of options.staging.items) {
    if (item.sourceStatus !== "verified-storage-path") {
      throw new Error("Audiobook without a verified storage path: " + item.id);
    }
    const match = matches.get(item.id);
    const enrichment = enrichments.get(item.storagePath);
    const relatedBooks = match?.match?.hash && options.books.entries[match.match.hash] ? [match.match.hash] : [];
    const author = normalizeDisplayText(enrichment?.author || match?.match?.author || item.author || "Unbekannt");
    const title = normalizeDisplayText(enrichment?.title || item.title || item.sourceName);
    const category = enrichment?.category || categorize(title, item.mediaType);
    const facts = sourceFacts[item.storagePath] || { audioFormats: [], audioFileCount: 0, audioBytes: 0, audioLastModified: "" };
    const previous = options.previousIndex?.entries[item.id];
    entries[item.id] = {
      id: item.id,
      sourceName: item.sourceName,
      sourceProvider: options.staging.source.provider || "storage",
      sourceVisibility: options.staging.source.visibility || "private",
      storagePath: item.storagePath,
      sourceLink: enrichment?.legacyPrivateUrl || previous?.sourceLink || null,
      legacyPrivatePath: item.storagePath,
      mediaType: item.mediaType,
      title,
      author,
      narrator: normalizeDisplayText(enrichment?.narrator) || "",
      duration: normalizeDisplayText(enrichment?.duration) || "",
      audioFormats: facts.audioFormats,
      audioFileCount: facts.audioFileCount,
      audioBytes: facts.audioBytes,
      audioLastModified: facts.audioLastModified,
      language: normalizeDisplayText(enrichment?.language) || "",
      year: normalizeDisplayText(enrichment?.year) || extractYear(title) || "",
      category,
      synopsis: normalizeDisplayText(enrichment?.synopsis) || "No source-backed synopsis is available for this verified storage entry yet.",
      synopsisStatus: enrichment?.synopsisStatus || (enrichment?.synopsis ? "verified" : "inventory-note"),
      synopsisSource: normalizeDisplayText(enrichment?.synopsisSource) || "Verified storage inventory; no synopsis captured",
      sourceMetadataFiles: enrichment?.sourceMetadataFiles || [],
      localBookSources: enrichment?.localBookSources || [],
      publicMetadataSources: enrichment?.publicMetadataSources || [],
      sourceStatus: "verified-storage-path",
      metadataStatus: enrichment?.metadataStatus || (enrichment ? "enriched-local-metadata" : (relatedBooks.length ? "matched-book" : "needs-enrichment")),
      matchStatus: match?.matchStatus || "unmatched",
      relatedBooks,
      relatedTopicLinks: category.map((value) => "topics/" + slugify(value) + ".md"),
      cover: previous?.cover || "",
      legacyPublicLink: previous?.legacyPublicLink || null,
      legacyPrivateUrl: enrichment?.legacyPrivateUrl || previous?.legacyPrivateUrl || null,
      catalogPath: "",
    };
  }
  const catalogFileNames = assignCatalogFileNames(Object.values(entries), (record) => record.id);
  for (const record of Object.values(entries)) {
    record.catalogPath = path.posix.join(options.catalogDir, catalogFileNames[record.id]);
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      provider: options.staging.source.provider || "storage",
      visibility: options.staging.source.visibility || "private",
      root: options.staging.source.root,
      inventoryReadback: options.inventoryReadback,
    },
    entries,
  };
}

export function normalizeAudiobookIndex(value: unknown): AudiobookIndex | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AudiobookIndex> & {
    entries?: Record<string, Record<string, unknown>>;
  };
  if (!raw.entries) return null;
  const entries: Record<string, AudiobookRecord> = {};
  for (const [id, inputRecord] of Object.entries(raw.entries)) {
    const record = inputRecord as Partial<AudiobookRecord> & Record<string, unknown>;
    if (!record?.id) continue;
    const legacyPrivateUrl = readString(record.legacyPrivateUrl) ?? readString(record.privateMegaUrl);
    const legacyPublicLink = readString(record.legacyPublicLink) ?? readString(record.publicLink);
    const storagePath = readString(record.storagePath) ?? readString(record.privateMegaPath) ?? "";
    const relatedTopicLinks = readStringArray(record.relatedTopicLinks) ?? readStringArray(record.karpathyLinks) ?? [];
    const legacySourceStatus = readString(record.sourceStatus);
    const sourceVisibility =
      record.sourceVisibility === "public" || record.sourceVisibility === "private" || record.sourceVisibility === "local"
        ? record.sourceVisibility
        : legacyPublicLink ? "public" : "private";
    const sourceStatus =
      legacySourceStatus === "verified-private-path"
        ? "verified-storage-path"
        : legacySourceStatus === "verified-local-path" || legacySourceStatus === "verified-storage-path" || legacySourceStatus === "manual"
          ? legacySourceStatus
          : sourceVisibility === "local" ? "verified-local-path" : "verified-storage-path";
    entries[id] = {
      ...record,
      id: record.id || id,
      sourceName: readString(record.sourceName) || "",
      sourceProvider: readString(record.sourceProvider) || raw.source?.provider || "storage",
      sourceVisibility: record.sourceVisibility || (legacyPublicLink ? "public" : "private"),
      storagePath,
      sourceLink: readString(record.sourceLink) ?? legacyPrivateUrl ?? legacyPublicLink ?? null,
      mediaType: record.mediaType === "series" || record.mediaType === "periodical" ? record.mediaType : "audiobook",
      title: readString(record.title) || "",
      author: readString(record.author) || "",
      narrator: readString(record.narrator) || "",
      duration: readString(record.duration) || "",
      audioFormats: readStringArray(record.audioFormats) || [],
      audioFileCount: readNumber(record.audioFileCount),
      audioBytes: readNumber(record.audioBytes),
      audioLastModified: readString(record.audioLastModified) || "",
      language: readString(record.language) || "",
      year: readString(record.year) || "",
      category: readStringArray(record.category) || ["Audiobooks"],
      synopsis: readString(record.synopsis) || "",
      synopsisStatus: record.synopsisStatus === "verified" ? "verified" : "inventory-note",
      synopsisSource: readString(record.synopsisSource) || "",
      sourceMetadataFiles: readStringArray(record.sourceMetadataFiles) || [],
      localBookSources: readStringArray(record.localBookSources) || [],
      publicMetadataSources: readStringArray(record.publicMetadataSources) || [],
      sourceStatus,
      metadataStatus:
        record.metadataStatus === "inventory-indexed" ||
        record.metadataStatus === "matched-book" ||
        record.metadataStatus === "needs-enrichment" ||
        record.metadataStatus === "enriched-local-metadata" ||
        record.metadataStatus === "enriched-public-metadata" ||
        record.metadataStatus === "manual"
          ? record.metadataStatus
          : readString(record.synopsis) ? "enriched-local-metadata" : "needs-enrichment",
      matchStatus: record.matchStatus === "matched" || record.matchStatus === "ambiguous" ? record.matchStatus : "unmatched",
      relatedBooks: readStringArray(record.relatedBooks) || [],
      legacyPrivatePath: storagePath,
      legacyPublicLink,
      legacyPrivateUrl,
      relatedTopicLinks,
      cover: readString(record.cover) || "",
      catalogPath: readString(record.catalogPath) || "",
    };
  }
  return {
    ...raw,
    version: raw.version || 1,
    generatedAt: raw.generatedAt || "",
    source: raw.source || { provider: "unknown", visibility: "local", root: "", inventoryReadback: "" },
    entries,
  };
}

export function normalizeAudiobookRecord(record: AudiobookRecord): AudiobookRecord {
  return {
    ...record,
    sourceName: normalizeDisplayText(record.sourceName),
    storagePath: normalizeDisplayText(record.storagePath || record.legacyPrivatePath),
    legacyPrivatePath: normalizeDisplayText(record.legacyPrivatePath),
    title: normalizeDisplayText(record.title),
    author: normalizeDisplayText(record.author),
    narrator: normalizeDisplayText(record.narrator),
    duration: normalizeDisplayText(record.duration),
    language: normalizeDisplayText(record.language),
    year: normalizeDisplayText(record.year),
    category: record.category.map((value) => normalizeDisplayText(value)).filter(Boolean),
    synopsis: normalizeDisplayText(record.synopsis),
    synopsisSource: normalizeDisplayText(record.synopsisSource),
  };
}

export function upsertManualAudiobook(
  currentIndex: AudiobookIndex | null,
  input: ManualAudiobookInput,
  catalogDir: string
): { index: AudiobookIndex; record: AudiobookRecord } {
  const title = normalizeDisplayText(input.title);
  if (!title) throw new Error("Title is required");
  const author = normalizeDisplayText(input.author) || "Unbekannt";
  const storagePath = normalizeDisplayText(input.storagePath);
  const sourceLink = normalizeDisplayText(input.sourceLink);
  const id = sha256(["manual", title.toLocaleLowerCase(), author.toLocaleLowerCase(), storagePath.toLocaleLowerCase()].join("\0"));
    const previous = currentIndex?.entries[id];
    const readLegacy = (key: string): string | null => {
      const value = (previous as AudiobookRecord & Record<string, unknown> | undefined)?.[key];
      return typeof value === "string" && value.length > 0 ? value : null;
    };
  const categories = [...new Set((input.categories?.map((value) => value.trim()).filter(Boolean) || []).concat(["Audiobooks"]))];
  const synopsis = input.synopsis?.trim() || previous?.synopsis || "";
  const sourceName = storagePath || sourceLink || title;
  const record: AudiobookRecord = {
    id,
    sourceName,
    sourceProvider: sourceLink ? "web" : "local",
    sourceVisibility: sourceLink ? "private" : "local",
    storagePath,
    sourceLink: sourceLink || null,
    legacyPrivatePath: storagePath,
    mediaType: "audiobook",
    title,
    author,
    narrator: previous?.narrator || "",
    duration: previous?.duration || "",
    audioFormats: previous?.audioFormats || [],
    audioFileCount: previous?.audioFileCount || 0,
    audioBytes: previous?.audioBytes || 0,
    audioLastModified: previous?.audioLastModified || "",
    language: previous?.language || "",
    year: previous?.year || extractYear(title) || "",
    category: categories.length > 1 ? categories : previous?.category || ["Audiobooks", "Allgemein"],
    synopsis,
    synopsisStatus: synopsis ? "verified" : "inventory-note",
    synopsisSource: synopsis ? "Manual entry by library owner" : "Manual entry; no synopsis captured",
    sourceMetadataFiles: previous?.sourceMetadataFiles || [],
    localBookSources: previous?.localBookSources || [],
    publicMetadataSources: previous?.publicMetadataSources || [],
    sourceStatus: "manual",
    metadataStatus: synopsis ? "enriched-local-metadata" : "manual",
    matchStatus: previous?.matchStatus || "unmatched",
    relatedBooks: previous?.relatedBooks || [],
    relatedTopicLinks: categoryLinks(categories),
    cover: previous?.cover || "",
    legacyPublicLink: previous?.legacyPublicLink || readLegacy("publicLink"),
    legacyPrivateUrl: previous?.legacyPrivateUrl || readLegacy("privateMegaUrl"),
    catalogPath: previous?.catalogPath || "",
  };
  const index: AudiobookIndex = {
    version: currentIndex?.version || 1,
    generatedAt: new Date().toISOString(),
    source: currentIndex?.source || {
      provider: "manual",
      visibility: sourceLink ? "private" : "local",
      root: "",
      inventoryReadback: "manual entry",
    },
    entries: { ...(currentIndex?.entries || {}), [id]: record },
  };
  const catalogFileNames = assignCatalogFileNames(Object.values(index.entries), (entry) => entry.id);
  for (const entry of Object.values(index.entries)) {
    entry.catalogPath = path.posix.join(catalogDir, catalogFileNames[entry.id]);
  }
  return { index, record: index.entries[id] };
}

export function buildLocalAudiobookIndex(options: LocalAudiobookScanOptions): AudiobookIndex {
  const root = options.libraryPath.trim();
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error("Audiobook folder does not exist");
  }
  const items: StagingItem[] = [];
  const facts: Record<string, AudioInventoryFacts> = {};
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    const audioEntries = entries.filter((entry) => entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()));
    if (audioEntries.length > 0) {
      const relativePath = path.relative(root, current);
      const sourceName = path.basename(current);
      const identity = parseTitleAuthor(sourceName);
      items.push({
        id: sha256(path.resolve(current)),
        sourceName,
        storagePath: path.resolve(current),
        mediaType: "audiobook",
        title: identity.title,
        author: identity.author,
        sourceStatus: "verified-local-path",
      });
      facts[path.resolve(current)] = summarizeAudioFiles(audioEntries.map((entry) => ({
        size: fs.statSync(path.join(current, entry.name)).size,
        mtime: fs.statSync(path.join(current, entry.name)).mtime.toISOString(),
        extension: path.extname(entry.name).slice(1),
      })));
      continue;
    }
    for (const entry of entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))) {
      stack.push(path.join(current, entry.name));
    }
  }
  if (items.length === 0) throw new Error("No audiobooks found");

  const entries: Record<string, AudiobookRecord> = {};
  for (const item of items) {
    const itemFacts = facts[item.storagePath] || { audioFormats: [], audioFileCount: 0, audioBytes: 0, audioLastModified: "" };
    const previous = options.previousIndex?.entries[item.id];
    const readLegacy = (key: string): string | null => {
      const value = (previous as AudiobookRecord & Record<string, unknown> | undefined)?.[key];
      return typeof value === "string" && value.length > 0 ? value : null;
    };
    entries[item.id] = {
      id: item.id,
      sourceName: item.sourceName,
      sourceProvider: "local",
      sourceVisibility: "local",
      storagePath: item.storagePath,
      sourceLink: null,
      legacyPrivatePath: item.storagePath,
      mediaType: item.mediaType,
      title: item.title,
      author: item.author || "Unbekannt",
      narrator: previous?.narrator || "",
      duration: previous?.duration || "",
      audioFormats: itemFacts.audioFormats,
      audioFileCount: itemFacts.audioFileCount,
      audioBytes: itemFacts.audioBytes,
      audioLastModified: itemFacts.audioLastModified,
      language: previous?.language || "",
      year: previous?.year || extractYear(item.title) || "",
      category: previous?.category || categorize(item.title, item.mediaType),
      synopsis: previous?.synopsis || "",
      synopsisStatus: previous?.synopsisStatus || "inventory-note",
      synopsisSource: previous?.synopsisSource || "Local folder scan; no synopsis available",
      sourceMetadataFiles: previous?.sourceMetadataFiles || [],
      localBookSources: previous?.localBookSources || [],
      publicMetadataSources: previous?.publicMetadataSources || [],
      sourceStatus: "verified-local-path",
      metadataStatus: "inventory-indexed",
      matchStatus: "unmatched",
      relatedBooks: [],
      relatedTopicLinks: categoryLinks(previous?.category || categorize(item.title, item.mediaType)),
      cover: previous?.cover || "",
      legacyPublicLink: previous?.legacyPublicLink || readLegacy("publicLink"),
      legacyPrivateUrl: previous?.legacyPrivateUrl || readLegacy("privateMegaUrl"),
      catalogPath: "",
    };
  }
  const catalogFileNames = assignCatalogFileNames(Object.values(entries), (record) => record.id);
  for (const record of Object.values(entries)) {
    record.catalogPath = path.posix.join(options.catalogDir, catalogFileNames[record.id]);
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: { provider: "local", visibility: "local", root, inventoryReadback: "desktop folder scan" },
    entries,
  };
}

function parseTitleAuthor(value: string): { title: string; author: string } {
  const extension = path.extname(value).toLowerCase();
  const stem = AUDIO_EXTENSIONS.has(extension) ? value.slice(0, -extension.length) : value;
  const match = stem.match(/^(.*?)\s*[-–—]\s*(.+)$/);
  return match ? { title: match[1].trim(), author: match[2].trim() } : { title: stem.trim(), author: "" };
}

function summarizeAudioFiles(files: Array<{ size: number; mtime: string; extension: string }>): AudioInventoryFacts {
  const formats = new Set<string>();
  let bytes = 0;
  let lastModified = "";
  for (const file of files) {
    formats.add(file.extension.toUpperCase());
    bytes += file.size;
    if (file.mtime > lastModified) lastModified = file.mtime;
  }
  return { audioFormats: [...formats], audioFileCount: files.length, audioBytes: bytes, audioLastModified: lastModified };
}

function categoryLinks(categories: string[]): string[] {
  return categories.map((value) => "topics/" + slugify(value) + ".md");
}

export interface AudiobookRenderOptions {
  language?: Language;
  technicalExpanded?: boolean;
}

export function audiobookSourceLink(record: AudiobookRecord): string | null {
  return (
    record.sourceLink ??
    record.legacyPrivateUrl ??
    ((record as unknown as Record<string, unknown>).privateMegaUrl as string | null | undefined) ??
    record.legacyPublicLink ??
    ((record as unknown as Record<string, unknown>).publicLink as string | null | undefined) ??
    null
  );
}

export function writeAudiobookCatalog(
  index: AudiobookIndex,
  catalogDir: string,
  books: BookIndex,
  options: AudiobookRenderOptions = {}
): void {
  fs.mkdirSync(catalogDir, { recursive: true });
  const bookLinks = Object.fromEntries(
    Object.entries(books.entries).map(([hash, record]) => [
      hash,
      { title: record.title, catalogPath: record.catalogPath },
    ])
  );
  for (const record of Object.values(index.entries)) {
    fs.writeFileSync(
      path.join(catalogDir, audiobookCatalogFileName(record)),
      renderAudiobookRecord(record, bookLinks, options),
      "utf8"
    );
  }
  const topicDir = path.join(catalogDir, "topics");
  fs.mkdirSync(topicDir, { recursive: true });
  const categories = [...new Set(Object.values(index.entries).flatMap((record) => record.category))].sort();
  for (const category of categories) {
    const records = Object.values(index.entries).filter((record) => record.category.includes(category)).sort((a, b) => a.title.localeCompare(b.title));
    const body = [
      "# Audiobooks: " + category,
      "",
      "> Related-topic index connecting audiobooks with matching book notes and categories.",
      "",
      "## Audiobooks",
      "",
      ...records.map((record) => "- [[" + audiobookLinkTarget(record) + "|" + record.title + "]] — " + record.author),
      "",
    ].join("\n");
    fs.writeFileSync(path.join(topicDir, slugify(category) + ".md"), body, "utf8");
  }
  const records = Object.values(index.entries);
  const rootMoc = [
    "# Audiobook Library",
    "",
    "> Related-topic index for verified audiobook sources, topic clusters and book matches.",
    "",
    "## Inventur",
    "",
    "- Source provider: " + (index.source.provider || "unknown"),
    "- Root: " + index.source.root,
    "- Audiobook-Einträge: " + records.length,
    "- Verified paths: " + records.filter((record) => record.sourceStatus.startsWith("verified")).length,
    "- Covers: " + records.filter((record) => Boolean(record.cover)).length,
    "- External source links: " + records.filter((record) => Boolean(audiobookSourceLink(record))).length,
    "- Strenge Buchmatches: " + records.filter((record) => record.matchStatus === "matched").length,
    "- Ambige Buchmatches: " + records.filter((record) => record.matchStatus === "ambiguous").length,
    "- Quellenbelegte Synopsen: " + records.filter((record) => record.synopsisStatus === "verified").length,
    "- Öffentliche Katalognachweise: " + records.filter((record) => record.publicMetadataSources.length > 0).length,
    "- Audio-Dateien: " + records.reduce((sum, record) => sum + record.audioFileCount, 0),
    "- Audio-Gesamtgröße: " + formatBytes(records.reduce((sum, record) => sum + record.audioBytes, 0)),
    "",
    "## Themen",
    "",
    ...categories.map((category) => "- [[topics/" + slugify(category) + "|" + category + "]]"),
    "",
    "## Synopsis-Status",
    "",
    records.filter((record) => record.synopsisStatus === "verified").length + " entries have a source-backed synopsis. Other entries contain a transparent inventory note; enrichment is never invented.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(catalogDir, "README.md"), rootMoc, "utf8");
  fs.writeFileSync(path.join(catalogDir, ".book-library-audiobook-index.json"), JSON.stringify(index, null, 2) + "\n", "utf8");
}

export function renderAudiobookRecord(
  record: AudiobookRecord,
  bookLinks: Record<string, string | { title: string; catalogPath?: string }>,
  options: AudiobookRenderOptions = {}
): string {
  const en = (options.language || "de") === "en";
  const related = record.relatedBooks.map((hash) => {
    const book = bookLinks[hash];
    const title = typeof book === "string" ? book : book?.title || hash;
    const catalogPath = typeof book === "string" ? `${hash}.md` : book?.catalogPath || `${hash}.md`;
    return "- [[" + catalogLinkTarget(catalogPath, "_catalog") + "|" + title + "]]";
  });
  const topicLinks = [...new Set([...(record.relatedTopicLinks || []), ...categoryLinks(record.category)])].map(
    (link) => "- [[" + link + "|" + path.basename(link, ".md").replace(/\.md$/, "") + "]]"
  );
  const sourceLink = audiobookSourceLink(record);
  const cover = record.cover
    ? `![[covers/${record.cover}|120]]`
    : (en ? "_No cover available._" : "_Kein Cover vorhanden._");
  const synopsis = record.synopsis
    ? [
      "> **Synopsis**",
      ">",
      ...record.synopsis.split(/\r?\n/).map((line) => `> ${line}`),
      "",
    ]
    : [];
  const publicLinks = record.publicMetadataSources.map(
    (source) => "- [" + publicSourceLabel(source) + "](" + source + ")"
  );
  const links = [
    ...(sourceLink ? ["- [" + (en ? "Open original audio" : "Originalaudio öffnen") + "](" + sourceLink + ")"] : []),
    ...publicLinks,
  ];
  const technicalMarker = options.technicalExpanded ? "+" : "-";
  const technicalLines = [
    `> **${en ? "Format" : "Format"}:** ${record.mediaType.toUpperCase()} · **${en ? "Year" : "Jahr"}:** ${record.year || "—"} · **${en ? "Language" : "Sprache"}:** ${record.language || "—"}`,
    `> **${en ? "Narrator" : "Sprecher"}:** ${record.narrator || "—"} · **${en ? "Duration" : "Dauer"}:** ${record.duration || "—"}`,
    `> **${en ? "Audio formats" : "Audioformate"}:** ${record.audioFormats.join(", ") || "—"} · **${en ? "Files" : "Dateien"}:** ${record.audioFileCount} · **${en ? "Total size" : "Gesamtgröße"}:** ${formatBytes(record.audioBytes)}`,
    `> **${en ? "Path" : "Pfad"}:** \`${record.storagePath || record.legacyPrivatePath || "—"}\``,
    `> **${en ? "Synopsis source" : "Synopsis-Quelle"}:** ${record.synopsisSource || "—"}`,
    `> **${en ? "Status" : "Status"}:** ${record.sourceStatus} · ${record.metadataStatus} · ${record.matchStatus}`,
    ...record.sourceMetadataFiles.map((source) => `> **${en ? "Metadata file" : "Metadatendatei"}:** \`${source}\``),
    ...record.localBookSources.map((source) => `> **${en ? "Local book source" : "Lokale Buchquelle"}:** ${source}`),
  ];
  return [
    "---",
    "kind: audiobook",
    "book-library-generated: true",
    "cssclasses: [book-library-catalog-note]",
    `aliases: [${JSON.stringify(record.title)}]`,
    "mediaType: " + record.mediaType,
    "sourceProvider: " + JSON.stringify(record.sourceProvider || "storage"),
    "sourceVisibility: " + JSON.stringify(record.sourceVisibility || "private"),
    "storagePath: " + JSON.stringify(record.storagePath || record.legacyPrivatePath),
    ...(sourceLink ? ["sourceLink: " + JSON.stringify(sourceLink)] : []),
    "title: " + JSON.stringify(record.title),
    "author: " + JSON.stringify(record.author),
    "narrator: " + JSON.stringify(record.narrator),
    "duration: " + JSON.stringify(record.duration),
    "audioFormats: [" + record.audioFormats.map((value) => JSON.stringify(value)).join(", ") + "]",
    "audioFileCount: " + record.audioFileCount,
    "audioBytes: " + record.audioBytes,
    "audioLastModified: " + JSON.stringify(record.audioLastModified),
    "language: " + JSON.stringify(record.language),
    "year: " + JSON.stringify(record.year),
    "categories: [" + record.category.map((value) => JSON.stringify(value)).join(", ") + "]",
    "cover: " + JSON.stringify(record.cover),
    "---",
    "",
    "# " + record.title,
    "",
    record.author,
    "",
    "## Cover",
    "",
    cover,
    "",
    ...synopsis,
    ...(related.length > 0
      ? ["## " + (en ? "Related books" : "Ähnliche Bücher"), "", ...related, ""]
      : []),
    ...(topicLinks.length > 0
      ? ["## " + (en ? "Related topics" : "Verwandte Themen"), "", ...topicLinks, ""]
      : []),
    "## " + (en ? "Links" : "Links"),
    "",
    ...(links.length > 0
      ? links
      : [en ? "- No external link available." : "- Kein externer Link verfügbar."]),
    "",
    "## " + (en ? "Technical details" : "Technische Details"),
    "",
    `> [!info]${technicalMarker} ${en ? "Technical details" : "Technische Details"}`,
    ...technicalLines,
    "",
  ].join("\n");
}

function audiobookCatalogFileName(record: AudiobookRecord): string {
  return catalogFileName({
    title: record.title,
    author: record.author,
    catalogPath: path.posix.basename(record.catalogPath || ""),
  });
}

function audiobookLinkTarget(record: AudiobookRecord): string {
  const fallback = `_audiobooks/${audiobookCatalogFileName(record)}`;
  return (record.catalogPath || fallback).replace(/\.md$/i, "");
}

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, exponent)).toFixed(exponent ? 1 : 0) + " " + units[exponent];
}

function publicSourceLabel(source: string): string {
  try { return new URL(source).hostname.replace(/^www\./, ""); }
  catch { return "Öffentliche Quelle"; }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function extractYear(title: string): string {
  return title.match(/\b(19|20)\d{2}\b/)?.[0] || "";
}

function categorize(title: string, mediaType: AudiobookMediaType): string[] {
  const value = title.toLowerCase();
  const result = ["Audiobooks"];
  if (mediaType === "series") result.push("Serien");
  if (mediaType === "periodical") result.push("Periodika");
  if (/(?:\bai\b|artificial intelligence|agentic|turing|robot|algorithm|digital|internet|code|cyber)/.test(value)) result.push("AI & Technologie");
  if (/(business|economy|money|market|entrepreneur|leadership|work|tax|stock|finance|copywriter)/.test(value)) result.push("Business & Wirtschaft");
  if (/(health|aging|food|fitness|meditation|psycho|eating|mind|sleep)/.test(value)) result.push("Gesundheit & Psychologie");
  if (/(war|history|mafia|bond|crime|murder|mystery|novel|hunter|killer|french|follett)/.test(value)) result.push("Geschichte & Fiktion");
  if (result.length === 1) result.push("Allgemein");
  return result;
}
