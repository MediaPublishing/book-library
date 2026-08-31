import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { renderCatalogRecord } from "../src/catalog";
import { LibraryIndexer } from "../src/indexer";
import { MetadataProvider } from "../src/metadata";
import type { BookRecord } from "../src/types";

function makeBook(): BookRecord {
  return {
    hash: "catalog-roundtrip",
    file: "Book.epub",
    format: "epub",
    size: 1,
    mtime: 1,
    cover: "",
    ingested: "2026-08-27T00:00:00.000Z",
    title: "Data Provenance",
    author: "A. Reader",
    year: "2026",
    language: "en",
    publisher: "Local Press",
    isbn: "",
    pages: "200",
    tags: ["research"],
    source: "google-books",
    summary: "A retained synopsis.",
    description: "A complete retained description.",
    rating: 4.5,
    ratingsCount: 12,
    categories: ["Computers, Data"],
    themes: ["provenance"],
    reviews: [{ source: "reader", author: "Taylor", rating: 5, text: "Useful, careful book." }],
    enrichmentSource: "google-books",
    sourceRatings: [{
      source: "google-books", url: "https://books.google.com/1", locale: "en",
      checkedAt: "2026-08-29T00:00:00Z", matchConfidence: 1, value: 4.5, count: 12,
      status: "provider-reported",
    }],
    sourceDescriptions: [{
      source: "google-books", url: "https://books.google.com/1", locale: "en",
      checkedAt: "2026-08-29T00:00:00Z", matchConfidence: 1, text: "A complete retained description.",
      kind: "source",
    }],
    externalIdentities: [{
      source: "open-library", url: "https://openlibrary.org/works/OL1W", locale: "en",
      checkedAt: "2026-08-29T00:00:00Z", matchConfidence: 1, workId: "OL1W",
    }],
    authorIdentity: { id: "open-library:OL1A", authorityIds: { "open-library": "OL1A" }, status: "matched" },
    related: [],
    wikiStatus: "none",
    markdownPath: "",
  };
}

describe("catalog enrichment round-trip", () => {
  it("preserves local enrichment when the indexer restores a catalog note", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "book-library-catalog-"));
    const catalogFile = path.join(root, "Data Provenance — A. Reader.md");
    const book = makeBook();
    fs.writeFileSync(catalogFile, renderCatalogRecord(book, { language: "en", wikiDir: "_wiki" }), "utf8");

    const indexer = new LibraryIndexer(new MetadataProvider(async () => ({ status: 404, text: "" })));
    const restored = (indexer as unknown as { readCatalogRecord: (file: string, hash: string) => BookRecord | null })
      .readCatalogRecord(catalogFile, book.hash);

    expect(restored).toMatchObject({
      hash: book.hash,
      summary: book.summary,
      description: book.description,
      categories: book.categories,
      themes: book.themes,
      reviews: book.reviews,
      enrichmentSource: book.enrichmentSource,
      sourceRatings: book.sourceRatings,
      sourceDescriptions: book.sourceDescriptions,
      externalIdentities: book.externalIdentities,
      authorIdentity: book.authorIdentity,
    });
  });
});
