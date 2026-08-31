import * as fs from "fs";
import * as path from "path";
import { catalogFileName, renderCatalogRecord } from "./catalog";
import { MetadataProvider, rasterImageExtension } from "./metadata";
import type { BookRecord } from "./types";
import type { Language } from "./i18n";
import { resolveGeneratedNoteTarget } from "./generated-note";

export interface CoverBackfillResult {
  added: number;
  skipped: number;
  enriched: number;
}

export interface CoverBackfillOptions {
  books: BookRecord[];
  provider: MetadataProvider;
  coversDir: string;
  catalogDir: string;
  wikiDir: string;
  language: Language;
  titles?: Record<string, string>;
  catalogPaths?: Record<string, string>;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function backfillMissingCovers(
  options: CoverBackfillOptions
): Promise<CoverBackfillResult> {
  const candidates = options.books.filter((book) => !book.cover);
  const total = candidates.length;
  const concurrency = Math.max(1, options.concurrency || 4);
  let done = 0;
  let added = 0;
  let enriched = 0;
  const titles = options.titles || {};
  const catalogPaths = options.catalogPaths || {};

  async function worker(book: BookRecord): Promise<void> {
    let changed = false;
    const fetched = book.isbn
      ? await options.provider.fetchByIsbn(book.isbn)
      : await options.provider.fetchByTitleAuthor(book.title, book.author);
    if (fetched) {
      const fields: Array<{ key: keyof BookRecord; value: string }> = [
        { key: "title", value: fetched.title },
        { key: "author", value: fetched.author },
        { key: "year", value: fetched.year },
        { key: "language", value: fetched.language },
        { key: "publisher", value: fetched.publisher },
        { key: "pages", value: fetched.pages },
        { key: "summary", value: fetched.description },
      ];
      for (const field of fields) {
        const record = book as unknown as Record<string, string>;
        if (!record[field.key] && field.value) {
          record[field.key] = field.value;
          changed = true;
        }
      }
      if (fetched.coverUrl) {
        try {
          const cover = await options.provider.downloadCover(fetched.coverUrl);
          const extName = cover ? rasterImageExtension(cover) : "";
          if (cover && extName) {
            const coverFile = `${book.hash}.${extName}`;
            fs.mkdirSync(options.coversDir, { recursive: true });
            fs.writeFileSync(path.join(options.coversDir, coverFile), cover);
            book.cover = coverFile;
            added += 1;
          }
        } catch {
          // Cover ist optional; die Metadaten-Anreicherung bleibt trotzdem.
        }
      }
      if (changed) {
        enriched += 1;
        book.source = fetched.source;
      }
    }
    if (book.cover || changed) {
      const preferred = path.join(options.catalogDir, catalogFileName(book));
      const target = await resolveGeneratedNoteTarget({
        exists: async (candidate) => fs.existsSync(candidate),
        read: async (candidate) => fs.readFileSync(candidate, "utf8"),
      }, preferred, "book");
      const catalogFile = target.path;
      book.catalogPath = path.basename(catalogFile);
      catalogPaths[book.hash] = book.catalogPath;
      fs.writeFileSync(
        catalogFile,
        renderCatalogRecord(book, {
          language: options.language,
          wikiDir: options.wikiDir,
          titles,
          catalogPaths,
        }),
        "utf8"
      );
    }
    done += 1;
    options.onProgress?.(done, total);
  }

  const queue = [...candidates];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const book = queue.shift();
      if (!book) break;
      try {
        await worker(book);
      } catch {
        // Ein einzelnes Buch darf den Backfill nicht stoppen.
      }
    }
  });
  await Promise.all(workers);
  return { added, skipped: Math.max(0, total - added), enriched };
}
