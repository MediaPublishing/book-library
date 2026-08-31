import { describe, expect, it } from "vitest";
import { applyFetchedMetadata, applyMichaelHudsonPilotIdentity, isMichaelHudsonPilotBook } from "../src/enrichment";
import type { BookRecord } from "../src/types";
import type { FetchedBookMetadata } from "../src/metadata";

const book = {
  hash: "pilot", file: "pilot.epub", format: "epub", size: 1, mtime: 1, cover: "", ingested: "",
  title: "J Is for Junk Economics", author: "Michael Hudson", year: "", language: "en", publisher: "",
  isbn: "", pages: "", tags: ["economics"], source: "local", summary: "", related: [], wikiStatus: "none", markdownPath: "",
} satisfies BookRecord;

describe("book enrichment", () => {
  it("bewahrt vertrauenswürdige Werte und ergänzt Quellenfelder", () => {
    const fetched = {
      title: book.title, author: book.author, year: "2017", language: "en", publisher: "ISLET", isbn: "123", pages: "300",
      coverUrl: "", description: "Provider description", rating: 4.4, ratingsCount: 17, categories: ["Economics"],
      source: "open-library+google-books", sourceUrl: "https://openlibrary.org/", sourceRatings: [{ source: "google-books", url: "https://books.google.com/1", locale: "en", checkedAt: "2026-08-29", matchConfidence: 1, value: 4.4, count: 17, status: "provider-reported" }],
      sourceDescriptions: [{ source: "google-books", url: "https://books.google.com/1", locale: "en", checkedAt: "2026-08-29", matchConfidence: 1, text: "Provider description", kind: "source" }],
      externalIdentities: [],
    } satisfies FetchedBookMetadata;

    const result = applyFetchedMetadata({ ...book, description: "My trusted local description" }, fetched);

    expect(result.description).toBe("My trusted local description");
    expect(result.sourceDescriptions).toHaveLength(1);
    expect(result.rating).toBe(4.4);
    expect(result.categories).toEqual(["Economics"]);
  });

  it("bindet nur die zwei Pilotbücher an das geprüfte Michael-Hudson-Profil", () => {
    const enriched = applyMichaelHudsonPilotIdentity(book);
    expect(enriched.authorIdentity?.id).toBe("open-library:OL7467564A");
    expect(enriched.sourceDescriptions?.[0]).toMatchObject({ kind: "ai-summary", source: "local-ai-summary" });
    expect(isMichaelHudsonPilotBook(enriched)).toBe(true);
    expect(applyMichaelHudsonPilotIdentity(enriched)).toEqual(enriched);
    expect(applyMichaelHudsonPilotIdentity({ ...book, title: "Unrelated Book" }).authorIdentity).toBeUndefined();
  });

  it("übernimmt keine mehrdeutigen Ausgabenfelder in einen vertrauenswürdigen lokalen Datensatz", () => {
    const ambiguous = {
      title: "Eine andere Ausgabe", author: "A. Reader", year: "2025", language: "de", publisher: "Other", isbn: "999",
      pages: "1", coverUrl: "", description: "Falsche Beschreibung", rating: 5, ratingsCount: 99, categories: ["Wrong"],
      source: "open-library+google-books", sourceUrl: "https://example.com", sourceRatings: [], sourceDescriptions: [], externalIdentities: [],
      enrichmentState: "ambiguous",
    } satisfies FetchedBookMetadata;

    const result = applyFetchedMetadata({ ...book, language: "en", description: "Lokale Beschreibung", rating: 4.2 }, ambiguous);

    expect(result).toMatchObject({
      title: book.title,
      language: "en",
      description: "Lokale Beschreibung",
      rating: 4.2,
      enrichmentState: "ambiguous",
    });
  });

  it("bewahrt den partiellen Providerzustand neben den Legacy-Feldern", () => {
    const partial = {
      title: book.title, author: book.author, year: "", language: "en", publisher: "", isbn: "", pages: "", coverUrl: "",
      description: "Partial description", rating: 0, ratingsCount: 0, categories: [], source: "open-library", sourceUrl: "https://openlibrary.org/",
      sourceRatings: [], sourceDescriptions: [], externalIdentities: [], enrichmentState: "partial", providerFailures: ["google-books"],
    } satisfies FetchedBookMetadata;

    expect(applyFetchedMetadata(book, partial).enrichmentState).toBe("partial");
  });
});
