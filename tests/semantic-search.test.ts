import { describe, expect, it } from "vitest";
import type { AudiobookRecord, BookRecord } from "../src/types";
import {
  calculateSemanticSimilarity,
  getSemanticLinkEvidence,
  getPreparedSemanticLinkEvidence,
  prepareSemanticRecord,
  rankPreparedSemanticSearch,
  rankSemanticSearch,
} from "../src/semantic-search";

const book = (overrides: Partial<BookRecord> = {}): BookRecord => ({
  hash: overrides.hash ?? "book-1",
  file: "book.epub",
  format: "epub",
  size: 1,
  mtime: 0,
  cover: "",
  ingested: "",
  title: overrides.title ?? "",
  author: overrides.author ?? "",
  year: "",
  language: overrides.language ?? "en",
  publisher: "",
  isbn: "",
  pages: "",
  tags: overrides.tags ?? [],
  source: "local",
  summary: overrides.summary ?? "",
  related: [],
  wikiStatus: "none",
  markdownPath: "",
  ...overrides,
});

const audiobook = (overrides: Partial<AudiobookRecord> = {}): AudiobookRecord => ({
  id: overrides.id ?? "audio-1",
  sourceName: "audio.m4b",
  legacyPrivatePath: "",
  mediaType: "audiobook",
  title: overrides.title ?? "",
  author: overrides.author ?? "",
  narrator: "",
  duration: "",
  audioFormats: [],
  audioFileCount: 1,
  audioBytes: 1,
  audioLastModified: "",
  language: overrides.language ?? "de",
  year: "",
  category: overrides.category ?? [],
  synopsis: overrides.synopsis ?? "",
  synopsisStatus: "inventory-note",
  synopsisSource: "",
  sourceMetadataFiles: [],
  localBookSources: [],
  sourceStatus: "manual",
  metadataStatus: "needs-enrichment",
  matchStatus: "unmatched",
  relatedBooks: [],
  relatedTopicLinks: [],
  cover: "",
  legacyPublicLink: null,
  legacyPrivateUrl: null,
  publicMetadataSources: [],
  catalogPath: "",
  ...overrides,
});

describe("semantic search", () => {
  it("finds a concept that appears only in a description or theme", () => {
    const records = [
      book({ hash: "theme", title: "Unrelated title", themes: ["Resilienz im Alltag"] } as Partial<BookRecord>),
      book({ hash: "description", title: "Another title", description: "A practical guide to resilient teams." }),
      book({ hash: "none", title: "No match" }),
    ];

    const results = rankSemanticSearch("resilient teams", records);
    expect(results[0].item.hash).toBe("description");
    expect(results[1].item.hash).toBe("theme");
    expect(results[1].score).toBeGreaterThan(0);
    expect(results[1].signals.some((signal) => signal.field === "themes")).toBe(true);
    expect(results[2].score).toBe(0);
    expect(results[0].signals.some((signal) => signal.field === "description")).toBe(true);
  });

  it("prioritizes an exact title over a weaker descriptive match", () => {
    const exact = book({ hash: "exact", title: "Deep Work" });
    const descriptive = book({ hash: "description", title: "Focus", summary: "A guide to deep work and concentration." });
    const results = rankSemanticSearch("Deep Work", [descriptive, exact]);

    expect(results[0].item.hash).toBe("exact");
    expect(results[0].reasons.join(" ")).toMatch(/exakt/i);
  });

  it("normalizes German casing, umlauts and stop words", () => {
    const results = rankSemanticSearch("DIE ÜBERNACHTUNG", [
      book({ hash: "match", title: "Übernachtung" }),
      book({ hash: "other", title: "Tagung" }),
    ]);

    expect(results[0].item.hash).toBe("match");
    expect(results[0].score).toBeGreaterThan(0);
    expect(rankSemanticSearch("STRAẞE", [book({ hash: "street", title: "Straße" })])[0].item.hash).toBe("street");
  });

  it("returns no results for an empty query", () => {
    expect(rankSemanticSearch("   ", [book(), book({ hash: "two" })])).toEqual([]);
  });

  it("finds title and author matches for stopword-only queries", () => {
    const english = book({ hash: "english", title: "The Book of Focus" });
    const german = book({ hash: "german", title: "Die Kunst des Denkens" });
    const substring = book({ hash: "substring", author: "Theodore Parker" });

    expect(rankSemanticSearch("the", [german, substring, english], { minScore: 0.0001 }).map(({ item }) => item.hash)).toEqual(["english"]);
    expect(rankSemanticSearch("die", [english, german], { minScore: 0.0001 })[0].item.hash).toBe("german");
  });

  it("applies threshold and limit before returning observable results", () => {
    const records = [
      book({ hash: "exact", title: "Automation" }),
      book({ hash: "weak", description: "Automation for teams" }),
      book({ hash: "none", title: "Cooking" }),
    ];

    expect(rankSemanticSearch("automation", records, { minScore: 0.0001 }).map(({ item }) => item.hash)).toEqual([
      "exact",
      "weak",
    ]);
    expect(rankSemanticSearch("automation", records, { minScore: 0.0001, limit: 1 })).toHaveLength(1);
  });

  it("reuses prepared records for ranking and link evidence", () => {
    const left = prepareSemanticRecord(book({ hash: "left", themes: ["Responsible automation"] } as Partial<BookRecord>));
    const right = prepareSemanticRecord(book({ hash: "right", themes: ["Automation strategy"] } as Partial<BookRecord>));

    expect(rankPreparedSemanticSearch("automation", [right], { minScore: 0.0001 })[0].item.hash).toBe("right");
    expect(getPreparedSemanticLinkEvidence(left, right).hasStrongSignal).toBe(true);
  });

  it("keeps input order for stable ties and exposes deterministic reasons", () => {
    const records = [book({ hash: "first", title: "Alpha" }), book({ hash: "second", title: "Beta" })];
    const first = rankSemanticSearch("missing", records);
    const second = rankSemanticSearch("missing", records);

    expect(first.map((result) => result.item.hash)).toEqual(["first", "second"]);
    expect(second).toEqual(first);
  });

  it("returns pairwise shared-field evidence for related records", () => {
    const left = book({ title: "AI Strategy", author: "Reto Stuber", themes: ["Automation", "Leadership"] } as Partial<BookRecord>);
    const right = audiobook({ title: "Practical Automation", author: "Reto Stuber", category: ["Business", "Leadership"] });
    const similarity = calculateSemanticSimilarity(left, right);
    const evidence = getSemanticLinkEvidence(left, right);

    expect(similarity.score).toBeGreaterThan(0);
    expect(similarity.signals.some((signal) => signal.field === "author" && signal.strong)).toBe(true);
    expect(evidence.hasStrongSignal).toBe(true);
    expect(evidence.reasons.join(" ")).toMatch(/autor/i);
  });
});
