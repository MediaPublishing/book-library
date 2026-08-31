import * as fs from "fs";
import * as path from "path";
import { parseEpub, extractEpubCover } from "./epub";
import { parsePdfMetadata } from "./pdf";
import { MetadataProvider, rasterImageExtension, type FetchedBookMetadata } from "./metadata";
import { computeRelatedBooks, extractTagsFromPath } from "./related";
import { normalizeDisplayText, sha256, slugify } from "./util";
import { isRecord, normalizeExternalIdentities, normalizeSourceBase, normalizeSourceDescriptions, normalizeSourceRatings } from "./source-metadata";
import { assignCatalogFileNames, catalogFileName, renderCatalogRecord } from "./catalog";
import { writeBookTopicMocs } from "./topics";
import { writeAuthorProfiles } from "./authors";
import { isBookLibraryOwnedMarkdown, resolveGeneratedNoteTarget } from "./generated-note";
import {
  CATALOG_VERSION,
  type BookIndex,
  type BookRecord,
  type BookReview,
  type AuthorIdentity,
  type AuthorSourceRecord,
  type ScanOptions,
  type ScanProgress,
} from "./types";
import { translate, type Language } from "./i18n";

export interface IndexCache {
  version: number;
  entries: Record<string, { mtime: number; size: number; hash: string; catalogFile: string }>;
}

export interface IndexerHooks {
  onProgress?: (progress: ScanProgress) => void;
}

export class LibraryIndexer {
  private metadata: MetadataProvider;
  private hooks: IndexerHooks;
  private abort = false;

  constructor(metadata: MetadataProvider, hooks: IndexerHooks = {}) {
    this.metadata = metadata;
    this.hooks = hooks;
  }

  cancel(): void {
    this.abort = true;
  }

  async scan(options: ScanOptions): Promise<{ index: BookIndex; added: number; updated: number; unmatched: string[] }> {
    this.abort = false;
    const cachePath = path.join(options.catalogDir, ".book-library-cache.json");
    const cache = this.loadCache(cachePath);
    const indexPath = path.join(options.catalogDir, ".book-library-index.json");
    const previousIndex = this.loadIndex(indexPath);
    const files = this.limitFiles(
      this.collectFiles(options.libraryPath, options.includeExtensions),
      options.maxFiles
    );
    const matched: Record<string, BookRecord> = {};
    const absoluteHashes = new Map<string, string>();
    let added = 0;
    let updated = 0;
    let metadataLookups = 0;
    const unmatched: string[] = [];

    const total = files.length;
    for (let i = 0; i < files.length; i++) {
      if (this.abort) {
        this.hooks.onProgress?.({ scanned: i, total, current: files[i], status: "error", error: "aborted" });
        break;
      }
      const absolute = files[i];
      const stat = fs.statSync(absolute);
      const cached = cache.entries[absolute];
      const hash = sha256(fs.readFileSync(absolute));
      const previousRecord = previousIndex.entries[hash];
      absoluteHashes.set(absolute, hash);
      let catalogFile: string;
      if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size && cached.hash === hash) {
        catalogFile = previousRecord
          ? this.catalogFilePath(options.catalogDir, previousRecord)
          : cached.catalogFile;
        if (fs.existsSync(catalogFile)) {
          const record = previousRecord
            ? { ...previousRecord, mtime: stat.mtimeMs }
            : this.readCatalogRecord(catalogFile, hash);
          if (record) {
            matched[record.hash] = record;
            this.hooks.onProgress?.({ scanned: i + 1, total, current: absolute, status: "running" });
            continue;
          }
        }
      }

      let local: Partial<BookRecord> = {};
      let localParsed = false;
      if (stat.size > 0 && stat.size < 100 * 1024 * 1024) {
        const result = await this.readLocalMetadata(absolute, stat.size, options);
        local = result.meta;
        localParsed = result.parsed;
      }
      if (stat.size > 0 && !localParsed) {
        unmatched.push(absolute);
      }
      let fetched: FetchedBookMetadata | null = null;
      let metadataAttempted = false;
      const metadataLimit = Math.max(0, options.maxMetadataLookups ?? 10);
      if (options.fetchMetadata && metadataLookups < metadataLimit) {
        metadataLookups += 1;
        metadataAttempted = true;
        try {
          fetched = await this.fetchMetadata(absolute, local);
        } catch {
          fetched = null;
        }
      }
      const record = await this.buildRecord(absolute, hash, stat, local, fetched, options, previousRecord);
      if (metadataAttempted && !fetched && !previousRecord?.enrichmentState) {
        record.enrichmentState = "failed";
      }
      matched[record.hash] = record;
      if (cached && cached.hash === hash) {
        updated += 1;
      } else {
        added += 1;
      }
      this.hooks.onProgress?.({ scanned: i + 1, total, current: absolute, status: "running" });
    }

    const index: BookIndex = {
      version: CATALOG_VERSION,
      generatedAt: new Date().toISOString(),
      entries: matched,
    };

    const catalogPaths = assignCatalogFileNames(Object.values(index.entries), (record) => record.hash);
    const noteAdapter = {
      exists: async (target: string) => fs.existsSync(target),
      read: async (target: string) => fs.readFileSync(target, "utf8"),
    };
    for (const record of Object.values(index.entries)) {
      const preferred = path.join(options.catalogDir, catalogPaths[record.hash]);
      const target = await resolveGeneratedNoteTarget(noteAdapter, preferred, "book");
      record.catalogPath = path.basename(target.path);
      catalogPaths[record.hash] = record.catalogPath;
    }

    const titles: Record<string, string> = {};
    for (const [relatedHash, relatedBook] of Object.entries(index.entries)) {
      index.entries[relatedHash].related = computeRelatedBooks(relatedBook, Object.values(index.entries));
      titles[relatedHash] = relatedBook.title;
    }
    writeBookTopicMocs(
      Object.values(index.entries),
      path.join(options.catalogDir, "topics"),
      options.language,
      options.catalogDir
    );
    writeAuthorProfiles(
      Object.values(index.entries),
      path.join(options.catalogDir, "authors"),
      options.language,
      options.catalogDir
    );
    for (const record of Object.values(index.entries)) {
      this.writeCatalogRecord(
        this.catalogFilePath(options.catalogDir, record),
        record,
        options.language,
        {
          wikiDir: options.wikiDir,
          titles,
          catalogPaths,
          amazonUrlTemplate: options.amazonUrlTemplate,
          goodreadsUrlTemplate: options.goodreadsUrlTemplate,
          topicsDir: path.posix.join(options.catalogDir, "topics"),
          authorsDir: path.posix.join(options.catalogDir, "authors"),
        }
      );
    }
    this.archiveLegacyHashNotes(options.catalogDir, index);
    this.writeCache(cachePath, files, absoluteHashes, options.catalogDir, index.entries);
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");

    this.hooks.onProgress?.({ scanned: files.length, total, current: "", status: "done" });
    return { index, added, updated, unmatched };
  }

  private collectFiles(libraryPath: string, extensions: string[]): string[] {
    if (!libraryPath || !fs.existsSync(libraryPath)) return [];
    const result: string[] = [];
    const stack = [libraryPath];
    while (stack.length > 0) {
      const current = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".")) continue;
          stack.push(absolute);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).slice(1).toLowerCase();
          if (extensions.includes(ext)) {
            result.push(absolute);
          }
        }
      }
    }
    return result.sort();
  }

  private limitFiles(files: string[], maxFiles: number): string[] {
    const limit = Number.isFinite(maxFiles) ? Math.max(0, Math.floor(maxFiles)) : files.length;
    return limit < files.length ? files.slice(0, limit) : files;
  }

  private async readLocalMetadata(
    absolute: string,
    size: number,
    options: ScanOptions
  ): Promise<{ meta: Partial<BookRecord>; parsed: boolean }> {
    const ext = path.extname(absolute).slice(1).toLowerCase();
    const base = normalizeDisplayText(path.basename(absolute, path.extname(absolute)));
    let title = base;
    let author = "";
    let year = "";
    let language = "";
    let publisher = "";
    let isbn = "";
    let pages = "";
    let localCover = "";
    const tags = options.tagsFromFolders
      ? extractTagsFromPath(path.relative(options.libraryPath, path.dirname(absolute)), path.basename(options.libraryPath))
      : [];

    const authorMatch = base.match(/^(.*?)\s*[-–—]\s*(.+)$/);
    if (authorMatch) {
      title = normalizeDisplayText(authorMatch[1]);
      author = normalizeDisplayText(authorMatch[2]);
    }
    const yearMatch = base.match(/\((\d{4})\)/);
    if (yearMatch) year = yearMatch[1];
    if (!year) {
      const folderYear = path.relative(options.libraryPath, path.dirname(absolute)).match(/\((\d{4})\)/);
      if (folderYear) year = folderYear[1];
    }
    let parsed = false;
    if (size > 0 && size < 100 * 1024 * 1024) {
      try {
        const buffer = fs.readFileSync(absolute);
        if (ext === "epub") {
          const epub = await parseEpub(buffer);
          title = epub.title || title;
          author = epub.author || author;
          language = epub.language;
          publisher = epub.publisher;
          isbn = epub.isbn;
          pages = epub.pages;
          const cover = await extractEpubCover(buffer, epub.coverPath);
          const ext = cover ? rasterImageExtension(cover) : "";
          if (cover && ext) {
            const coverFile = path.join(options.coversDir, `${sha256(buffer)}.${ext}`);
            fs.mkdirSync(path.dirname(coverFile), { recursive: true });
            fs.writeFileSync(coverFile, cover);
            localCover = path.basename(coverFile);
          }
        } else if (ext === "pdf") {
          const pdf = parsePdfMetadata(buffer);
          title = pdf.title || title;
          author = pdf.author || author;
          pages = pdf.pages;
          isbn = pdf.isbn;
        }
        parsed = true;
      } catch {
        // Lokale Metadaten sind optional; API-Anreicherung füllt Lücken.
      }
    }
    return { meta: { title, author, year, language, publisher, isbn, pages, tags, cover: localCover }, parsed };
  }

  private async fetchMetadata(
    absolute: string,
    local: Partial<BookRecord>
  ): Promise<FetchedBookMetadata | null> {
    if (local.isbn) {
      const byIsbn = await this.metadata.fetchByIsbn(local.isbn, local.language || "");
      if (byIsbn) return byIsbn;
    }
    return this.metadata.fetchByTitleAuthor(
      local.title || path.basename(absolute),
      local.author || "",
      local.language || ""
    );
  }

  private async buildRecord(
    absolute: string,
    hash: string,
    stat: fs.Stats,
    local: Partial<BookRecord>,
    fetched: FetchedBookMetadata | null,
    options: ScanOptions,
    previous?: BookRecord
  ): Promise<BookRecord> {
    const usableFetched = fetched?.enrichmentState === "ambiguous" ? null : fetched;
    const file = path.relative(options.libraryPath, absolute).split(path.sep).join("/");
    const ext = path.extname(absolute).slice(1).toLowerCase();
    const format: BookRecord["format"] = ext === "epub" || ext === "pdf" ? ext : "other";
    let coverFile = local.cover && fs.existsSync(path.join(options.coversDir, local.cover))
      ? local.cover
      : previous?.cover && fs.existsSync(path.join(options.coversDir, previous.cover))
        ? previous.cover
        : `${hash}.jpg`;
    if (
      coverFile === `${hash}.jpg` &&
      !fs.existsSync(path.join(options.coversDir, coverFile)) &&
      usableFetched?.coverUrl &&
      options.fetchMetadata
    ) {
      try {
        const cover = await this.metadata.downloadCover(usableFetched.coverUrl);
          const extName = cover ? rasterImageExtension(cover) : "";
          if (cover && extName) {
          coverFile = `${hash}.${extName}`;
          fs.mkdirSync(options.coversDir, { recursive: true });
          fs.writeFileSync(path.join(options.coversDir, coverFile), cover);
        }
      } catch {
        // Cover ist optional; Katalog entsteht trotzdem.
      }
    }
    return {
      ...previous,
      hash,
      file,
      format,
      size: stat.size,
      mtime: stat.mtimeMs,
      cover: fs.existsSync(path.join(options.coversDir, coverFile)) ? coverFile : "",
      ingested: previous?.ingested || new Date().toISOString(),
      title: normalizeDisplayText(usableFetched?.title || previous?.title || local.title || path.basename(absolute, path.extname(absolute))),
      author: normalizeDisplayText(usableFetched?.author || previous?.author || local.author || ""),
      year: normalizeDisplayText(usableFetched?.year || previous?.year || local.year || ""),
      language: normalizeDisplayText(local.language || previous?.language || usableFetched?.language || ""),
      publisher: normalizeDisplayText(usableFetched?.publisher || previous?.publisher || local.publisher || ""),
      isbn: usableFetched?.isbn || previous?.isbn || local.isbn || "",
      pages: usableFetched?.pages || previous?.pages || local.pages || "",
      tags: Array.from(new Set([...(previous?.tags || []), ...(local.tags || [])])),
      source: usableFetched?.source || previous?.source || "local",
      summary: normalizeDisplayText(usableFetched?.description || previous?.summary || previous?.description || ""),
      description: normalizeDisplayText(usableFetched?.description || previous?.description || previous?.summary || ""),
      rating: usableFetched?.rating || previous?.rating || 0,
      ratingsCount: usableFetched?.ratingsCount || previous?.ratingsCount || 0,
      // Kategorien sind sichtbare Bibliotheks-Metadaten, keine technischen Tags.
      categories: (usableFetched?.categories?.length ? usableFetched.categories : previous?.categories || [])
        .map(normalizeDisplayText).filter(Boolean),
      themes: previous?.themes || [],
      reviews: previous?.reviews || [],
      enrichmentSource: usableFetched?.source || previous?.enrichmentSource || "",
      sourceRatings: usableFetched?.sourceRatings?.length ? usableFetched.sourceRatings : previous?.sourceRatings || [],
      sourceDescriptions: usableFetched?.sourceDescriptions?.length ? usableFetched.sourceDescriptions : previous?.sourceDescriptions || [],
      externalIdentities: usableFetched?.externalIdentities?.length ? usableFetched.externalIdentities : previous?.externalIdentities || [],
      authorIdentity: usableFetched?.authorIdentity || previous?.authorIdentity,
      authorProfilePath: previous?.authorProfilePath || "",
      authorSources: previous?.authorSources || [],
      related: previous?.related || [],
      wikiStatus: previous?.wikiStatus || "none",
      markdownPath: previous?.markdownPath || "",
      wikiPath: previous?.wikiPath || "",
      catalogPath: previous?.catalogPath || "",
      enrichmentState: fetched?.enrichmentState || previous?.enrichmentState,
    };
  }

  private writeCatalogRecord(
    catalogFile: string,
    record: BookRecord,
    language: Language = "en",
    renderOptions: {
      wikiDir?: string;
      titles?: Record<string, string>;
      catalogPaths?: Record<string, string>;
      amazonUrlTemplate?: string;
      goodreadsUrlTemplate?: string;
      topicsDir?: string;
      authorsDir?: string;
    } = {}
  ): void {
    fs.mkdirSync(path.dirname(catalogFile), { recursive: true });
    const content = renderCatalogRecord(record, {
      language,
      wikiDir: renderOptions.wikiDir || "_wiki",
      titles: renderOptions.titles,
      catalogPaths: renderOptions.catalogPaths,
      amazonUrlTemplate: renderOptions.amazonUrlTemplate,
      goodreadsUrlTemplate: renderOptions.goodreadsUrlTemplate,
      topicsDir: renderOptions.topicsDir,
      authorsDir: renderOptions.authorsDir,
    });
    if (
      fs.existsSync(catalogFile) &&
      !isBookLibraryOwnedMarkdown(fs.readFileSync(catalogFile, "utf8"), "book")
    ) {
      throw new Error(`Refusing to overwrite user-owned catalog note: ${catalogFile}`);
    }
    fs.writeFileSync(catalogFile, content, "utf8");
  }

  private readCatalogRecord(catalogFile: string, expectedHash = ""): BookRecord | null {
    try {
      const text = fs.readFileSync(catalogFile, "utf8");
      const m = text.match(/^---\n([\s\S]*?)\n---/);
      if (!m) return null;
      const values: Record<string, string> = {};
      for (const line of m[1].split("\n")) {
        const idx = line.indexOf(":");
        if (idx > 0) values[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
      const tags = parseStringArray(values["tags"] || "[]");
      return {
        hash: values["hash"] || expectedHash,
        file: values["file"] || "",
        format: (values["format"] || "other") as BookRecord["format"],
        size: Number(values["size"] || 0),
        mtime: 0,
        cover: values["cover"] || "",
        ingested: values["ingested"] || "",
        title: unquote(values["title"] || ""),
        author: unquote(values["author"] || ""),
        year: unquote(values["year"] || ""),
        language: unquote(values["language"] || ""),
        publisher: unquote(values["publisher"] || ""),
        isbn: unquote(values["isbn"] || ""),
        pages: unquote(values["pages"] || ""),
        tags,
        source: unquote(values["source"] || ""),
        summary: unquote(values["summary"] || values["description"] || ""),
        description: unquote(values["description"] || ""),
        rating: Number(values["rating"] || 0),
        ratingsCount: Number(values["ratingsCount"] || 0),
        categories: parseStringArray(values["categories"] || "[]"),
        themes: parseStringArray(values["themes"] || "[]"),
        reviews: parseReviews(values["reviews"] || "[]"),
        enrichmentSource: unquote(values["enrichmentSource"] || ""),
        enrichmentState: normalizeEnrichmentState(unquote(values["enrichmentState"] || "")),
        sourceRatings: normalizeSourceRatings(parseJsonArray<unknown>(values["sourceRatings"] || "[]")),
        sourceDescriptions: normalizeSourceDescriptions(parseJsonArray<unknown>(values["sourceDescriptions"] || "[]")),
        externalIdentities: normalizeExternalIdentities(parseJsonArray<unknown>(values["externalIdentities"] || "[]")),
        authorIdentity: normalizeAuthorIdentity(parseJsonObject<unknown>(values["authorIdentity"] || "null")),
        authorProfilePath: normalizeGeneratedFilename(unquote(values["authorProfilePath"] || "")),
        authorSources: normalizeAuthorSources(parseJsonArray<unknown>(values["authorSources"] || "[]")),
        related: [],
        wikiStatus: (values["wikiStatus"] || "none") as BookRecord["wikiStatus"],
        markdownPath: unquote(values["markdownPath"] || ""),
        wikiPath: unquote(values["wikiPath"] || ""),
        catalogPath: path.basename(catalogFile),
      };
    } catch {
      return null;
    }
  }

  private loadCache(cachePath: string): IndexCache {
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, "utf8")) as IndexCache;
      if (data.version === CATALOG_VERSION) return data;
    } catch {
      // Cache fehlt oder ist beschädigt.
    }
    return { version: CATALOG_VERSION, entries: {} };
  }

  private loadIndex(indexPath: string): BookIndex {
    try {
      const data = JSON.parse(fs.readFileSync(indexPath, "utf8")) as BookIndex;
      if (data && data.entries) return data;
    } catch {
      // Index fehlt oder ist beschädigt. Der Scan kann ihn vollständig neu aufbauen.
    }
    return { version: CATALOG_VERSION, generatedAt: "", entries: {} };
  }

  private writeCache(
    cachePath: string,
    files: string[],
    absoluteHashes: Map<string, string>,
    catalogDir: string,
    records: Record<string, BookRecord>
  ): void {
    const entries: IndexCache["entries"] = {};
    for (const absolute of files) {
      const stat = fs.statSync(absolute);
      const hash = absoluteHashes.get(absolute) || "";
      entries[absolute] = {
        mtime: stat.mtimeMs,
        size: stat.size,
        hash,
        catalogFile: records[hash]
          ? this.catalogFilePath(catalogDir, records[hash])
          : path.join(catalogDir, `${hash}.md`),
      };
    }
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ version: CATALOG_VERSION, entries }, null, 2), "utf8");
  }

  private catalogFilePath(catalogDir: string, record: BookRecord): string {
    return path.join(catalogDir, catalogFileName(record));
  }

  private archiveLegacyHashNotes(catalogDir: string, index: BookIndex): void {
    if (!fs.existsSync(catalogDir)) return;
    const activeHashes = new Set(Object.keys(index.entries));
    const backupDir = path.join(catalogDir, ".book-library-legacy-hash-notes");
    for (const entry of fs.readdirSync(catalogDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[a-f0-9]{64}\.md$/i.test(entry.name)) continue;
      const hash = entry.name.replace(/\.md$/i, "");
      if (!activeHashes.has(hash)) continue;
      const source = path.join(catalogDir, entry.name);
      try {
        if (!isBookLibraryOwnedMarkdown(fs.readFileSync(source, "utf8"), "book")) continue;
      } catch {
        continue;
      }
      fs.mkdirSync(backupDir, { recursive: true });
      const destination = path.join(backupDir, entry.name);
      if (fs.existsSync(destination)) continue;
      fs.renameSync(source, destination);
    }
  }
}

export function normalizeBookRecord(record: BookRecord): BookRecord {
  return {
    ...record,
    title: normalizeDisplayText(record.title),
    author: normalizeDisplayText(record.author),
    year: normalizeDisplayText(record.year),
    language: normalizeDisplayText(record.language),
    publisher: normalizeDisplayText(record.publisher),
    summary: normalizeDisplayText(record.summary),
    description: normalizeDisplayText(record.description || ""),
    rating: record.rating || 0,
    ratingsCount: record.ratingsCount || 0,
    categories: (record.categories || []).map(normalizeDisplayText).filter(Boolean),
    themes: (record.themes || []).map(normalizeDisplayText).filter(Boolean),
    reviews: (record.reviews || []).map((review) => ({
      ...review,
      author: normalizeDisplayText(review.author),
      text: normalizeDisplayText(review.text),
    })),
    enrichmentSource: record.enrichmentSource || "",
    enrichmentState: normalizeEnrichmentState(record.enrichmentState),
    sourceRatings: normalizeSourceRatings(record.sourceRatings || []),
    sourceDescriptions: normalizeSourceDescriptions(record.sourceDescriptions || []),
    externalIdentities: normalizeExternalIdentities(record.externalIdentities || []),
    authorIdentity: normalizeAuthorIdentity(record.authorIdentity),
    authorProfilePath: normalizeGeneratedFilename(record.authorProfilePath || ""),
    authorSources: normalizeAuthorSources(record.authorSources || []),
    tags: record.tags.map((tag) => slugify(tag)).filter(Boolean),
  };
}

function normalizeEnrichmentState(value: unknown): BookRecord["enrichmentState"] {
  return value === "success" || value === "partial" || value === "ambiguous" || value === "failed"
    ? value
    : undefined;
}

function normalizeGeneratedFilename(value: unknown): string {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  return candidate && !candidate.includes("/") && !candidate.includes("\\") && candidate.toLocaleLowerCase().endsWith(".md")
    ? candidate
    : "";
}

function normalizeAuthorIdentity(value: unknown): AuthorIdentity | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) return undefined;
  if (value.status !== "matched" && value.status !== "local-name-match" && value.status !== "ambiguous") return undefined;
  const authorityIds = isRecord(value.authorityIds)
    ? Object.fromEntries(Object.entries(value.authorityIds).filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1].trim())))
    : {};
  return { id: normalizeDisplayText(value.id), authorityIds, status: value.status };
}

function normalizeAuthorSources(values: unknown[]): AuthorSourceRecord[] {
  return values.flatMap((value) => {
    const base = normalizeSourceBase(value);
    if (!base || !isRecord(value) || (value.kind !== "biography" && value.kind !== "profile" && value.kind !== "works")) return [];
    const text = normalizeDisplayText(typeof value.text === "string" ? value.text : "");
    const works = Array.isArray(value.works)
      ? value.works.filter((entry): entry is string => typeof entry === "string").map(normalizeDisplayText).filter(Boolean)
      : [];
    return [{ ...base, kind: value.kind, ...(text ? { text } : {}), ...(works.length ? { works } : {}) }];
  });
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  } catch {
    // Ältere Katalognotizen verwenden eine einfache YAML-ähnliche Liste.
  }
  return value.replace(/[\[\]"']/g, "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function parseReviews(value: string): BookReview[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Partial<BookReview> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        source: normalizeDisplayText(entry.source || ""),
        author: normalizeDisplayText(entry.author || ""),
        rating: typeof entry.rating === "number" ? entry.rating : 0,
        text: normalizeDisplayText(entry.text || ""),
      }))
      .filter((entry) => entry.text.length > 0);
  } catch {
    return [];
  }
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(value: string): T | undefined {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : undefined;
  } catch {
    return undefined;
  }
}
