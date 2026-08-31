import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAudiobookIndex, buildLocalAudiobookIndex, normalizeAudiobookIndex, normalizeAudiobookRecord, parseStorageAudioFacts, renderAudiobookRecord, upsertManualAudiobook, writeAudiobookCatalog, type AudiobookEnrichmentFile } from "../src/audiobooks";
import type { BookIndex } from "../src/types";

const books: BookIndex = {
  version: 1,
  generatedAt: "",
  entries: {
    bookhash: {
      hash: "bookhash", file: "Book.pdf", format: "pdf", size: 1, mtime: 0, cover: "bookhash.png", ingested: "",
      title: "How to Think About AI", author: "Verified Author", year: "", language: "", publisher: "", isbn: "", pages: "",
      tags: [], source: "local", summary: "", related: [], wikiStatus: "none", markdownPath: "", catalogPath: "How to Think About AI — Verified Author.md",
    },
  },
};

const staging = {
  generatedAt: "2026-08-21T00:00:00Z",
  source: { provider: "mega" as const, visibility: "private" as const, root: "Audio/Audiobooks" },
  items: [
    { id: "audio-1", sourceName: "How to Think About AI.m4b", storagePath: "Audio/Audiobooks/How to Think About AI.m4b", mediaType: "audiobook" as const, title: "How to Think About AI", sourceStatus: "verified-storage-path" as const },
    { id: "audio-2", sourceName: "Mystery Collection", storagePath: "Audio/Audiobooks/Mystery Collection", mediaType: "series" as const, title: "Mystery Collection", sourceStatus: "verified-storage-path" as const },
  ],
};

const rawInventory = [
  "/Audio/Audiobooks/How to Think About AI.m4b:",
  "----    1       123456 2026-08-21T00:00:00 How to Think About AI.m4b",
  "/Audio/Audiobooks/Mystery Collection:",
  "----    1        23456 2026-08-21T00:00:01 disc-01.mp3",
].join("\n");

const enrichments: AudiobookEnrichmentFile = {
  items: [
    {
      storagePath: "Audio/Audiobooks/How to Think About AI.m4b",
      legacyPrivateUrl: "https://mega.nz/fm/AbCdEfGh",
      title: "How to Think About AI: Verified Edition",
      author: "Verified Author",
      narrator: "Verified Narrator",
      duration: "1 h 2 min",
      language: "English",
      year: "2025",
      category: ["Audiobooks", "AI & Technologie"],
      synopsis: "Eine lokal belegte Synopsis.",
      synopsisSource: "Private provider-sidecar metadata",
      description: "Eine ausführliche Hörbuchbeschreibung.",
      rating: 4.4,
      ratingsCount: 128,
      reviews: [{ source: "audible", author: "Reader", rating: 5, text: "Sehr gut gesprochen." }],
      sourceRatings: [{ source: "audible", url: "https://audible.example/rating", locale: "de-DE", checkedAt: "2026-08-21", matchConfidence: 1, value: 4.4, count: 128, status: "provider-reported" }],
      sourceDescriptions: [{ source: "audible", url: "https://audible.example/description", locale: "de-DE", checkedAt: "2026-08-21", matchConfidence: 1, text: "Eine ausführliche Hörbuchbeschreibung.", kind: "source" }],
      externalIdentities: [{ source: "audible", url: "https://audible.example/a", locale: "de-DE", checkedAt: "2026-08-21", matchConfidence: 1, editionId: "aud-1" }],
      enrichmentSource: "audible",
      enrichmentState: "success",
      sourceMetadataFiles: ["Audio/Audiobooks/How to Think About AI.m4b/metadata.json"],
      localBookSources: ["local-book-epub:bookhash"],
      publicMetadataSources: ["https://openlibrary.org/works/OL123W"],
    },
  ],
};

const matches = {
  items: [
    { id: "audio-1", matchStatus: "matched" as const, match: { hash: "bookhash", author: "Verified Author", title: "How to Think About AI", hasSynopsis: false } },
    { id: "audio-2", matchStatus: "unmatched" as const, match: null },
  ],
};

describe("audiobook catalog", () => {
  it("indexes legacy private sources with neutral storage labels and related topics", () => {
    const index = buildAudiobookIndex({ catalogDir: "_audiobooks", inventoryReadback: "notes/inventory.txt", staging, matches, books, rawInventory, enrichments });
    expect(Object.keys(index.entries)).toHaveLength(2);
    expect(index.entries["audio-1"].author).toBe("Verified Author");
    expect(index.entries["audio-1"].title).toBe("How to Think About AI: Verified Edition");
    expect(index.entries["audio-1"].synopsisStatus).toBe("verified");
    expect(index.entries["audio-1"].sourceMetadataFiles).toEqual(["Audio/Audiobooks/How to Think About AI.m4b/metadata.json"]);
    expect(index.entries["audio-1"].localBookSources).toEqual(["local-book-epub:bookhash"]);
    expect(index.entries["audio-1"].publicMetadataSources).toEqual(expect.arrayContaining([
      "https://openlibrary.org/works/OL123W",
      "https://audible.example/rating",
      "https://audible.example/description",
      "https://audible.example/a",
    ]));
    expect(index.entries["audio-1"].description).toBe("Eine ausführliche Hörbuchbeschreibung.");
    expect(index.entries["audio-1"].rating).toBe(4.4);
    expect(index.entries["audio-1"].ratingsCount).toBe(128);
    expect(index.entries["audio-1"].reviews?.[0].text).toBe("Sehr gut gesprochen.");
    expect(index.entries["audio-1"].relatedBooks).toEqual(["bookhash"]);
    expect(index.entries["audio-2"].category).toContain("Serien");
    expect(index.entries["audio-2"].legacyPublicLink).toBeNull();
    expect(index.entries["audio-1"].legacyPrivateUrl).toBe("https://mega.nz/fm/AbCdEfGh");
    expect(index.entries["audio-1"].cover).toBe("");
    expect(index.entries["audio-1"].audioFormats).toEqual(["M4B"]);
    expect(index.entries["audio-1"].audioBytes).toBe(123456);
    expect(index.entries["audio-2"].audioFileCount).toBe(1);
    expect(parseStorageAudioFacts(rawInventory, "Audio/Audiobooks")["Audio/Audiobooks/How to Think About AI.m4b"].audioLastModified).toBe("2026-08-21T00:00:00");
    const note = renderAudiobookRecord(index.entries["audio-1"], {
      bookhash: { title: "How to Think About AI", catalogPath: "How to Think About AI — Verified Author.md" },
    });
    expect(note).toContain('sourceVisibility: "private"');
    expect(note).toContain("Audio/Audiobooks/How to Think About AI.m4b");
    expect(note).toContain("_catalog/How to Think About AI — Verified Author");
    expect(note).not.toContain("id: " + index.entries["audio-1"].id);
    expect(note).toContain("Eine lokal belegte Synopsis.");
    expect(note).toContain("Eine ausführliche Hörbuchbeschreibung.");
    expect(note).toContain("★★★★");
    expect(note).toContain("## Rezensionen");
    expect(note).toContain("Sehr gut gesprochen.");
    expect(note).toContain("Private provider-sidecar metadata");
    expect(note).toContain("Lokale Buchquelle:** local-book-epub:bookhash");
    expect(note).toContain("[openlibrary.org](https://openlibrary.org/works/OL123W)");
    expect(note).toContain("Gesamtgröße");
    expect(note).toContain("[Originalaudio öffnen](https://mega.nz/fm/AbCdEfGh)");
    expect(note).toContain("## Verwandte Themen");
    const fallbackNote = renderAudiobookRecord(index.entries["audio-2"], {});
    expect(fallbackNote).toContain("No source-backed synopsis");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "audiobook-catalog-"));
    writeAudiobookCatalog(index, root, books);
    expect(fs.existsSync(path.join(root, ".book-library-audiobook-index.json"))).toBe(true);
    expect(fs.readFileSync(path.join(root, "How to Think About AI Verified Edition — Verified Author.md"), "utf8")).toContain("## Technische Details");
    expect(fs.existsSync(path.join(root, "topics", "audiobooks.md"))).toBe(true);
    expect(fs.readFileSync(path.join(root, "README.md"), "utf8")).toContain("# Audiobook Library");
  });

  it("mirrors the ebook note hierarchy while keeping audio facts collapsed", () => {
    const index = buildAudiobookIndex({ catalogDir: "_audiobooks", inventoryReadback: "notes/inventory.txt", staging, matches, books, rawInventory, enrichments });
    const note = renderAudiobookRecord({ ...index.entries["audio-1"], cover: "audio-1.png" }, {
      bookhash: { title: "How to Think About AI", catalogPath: "How to Think About AI — Verified Author.md" },
    });
    const headings = ["## Cover", "## Ähnliche Bücher", "## Verwandte Themen", "## Links", "## Technische Details"];
    for (let index = 1; index < headings.length; index += 1) {
      expect(note.indexOf(headings[index - 1])).toBeLessThan(note.indexOf(headings[index]));
    }
    expect(note).toContain("book-library-generated: true");
    expect(note).toContain("cssclasses: [book-library-catalog-note]");
    expect(note).toContain("![[covers/audio-1.png|120]]");
    expect(note).toContain("> **Synopsis**");
    expect(note).toContain("> [!info]- Technische Details");
    expect(note).not.toContain("<details");
    expect(note).not.toContain("## Medienfakten");
  });

  it("keeps provider metadata from injecting Markdown links or embeds", () => {
    const index = buildAudiobookIndex({ catalogDir: "_audiobooks", inventoryReadback: "notes/inventory.txt", staging, matches, books, rawInventory, enrichments });
    const note = renderAudiobookRecord({
      ...index.entries["audio-1"],
      cover: "evil.jpg|999",
      description: "# injected [link]",
      sourceDescriptions: [],
      publicMetadataSources: ["javascript:alert(1)"],
      sourceRatings: [{ source: "unsafe", url: "javascript:alert(1)", locale: "", checkedAt: "", matchConfidence: 1, value: 5, count: 1, status: "provider-reported" }],
      reviews: [{ source: "unsafe", author: "[Author]", rating: 5, text: "[Click](javascript:alert(1))" }],
    }, {});
    expect(note).not.toContain("![[covers/evil");
    expect(note).not.toContain("[unsafe](javascript:");
    expect(note).toContain("\\# injected \\[link\\]");
    expect(note).toContain("\\[Click\\](javascript:alert(1))");
  });

  it("normalizes legacy indexes into neutral source fields without losing links", () => {
    const normalized = normalizeAudiobookIndex({
      version: 1,
      generatedAt: "",
      source: { provider: "mega", visibility: "private", root: "Audio/Audiobooks", inventoryReadback: "" },
      entries: {
        audio: {
          id: "audio",
          sourceName: "Book.m4b",
          storagePath: "Audio/Audiobooks/Book.m4b",
          mediaType: "audiobook",
          title: "Book",
          author: "Author",
          narrator: "", duration: "", audioFormats: [], audioFileCount: 0, audioBytes: 0, audioLastModified: "",
          language: "", year: "", category: [], synopsis: "", synopsisStatus: "inventory-note", synopsisSource: "",
          sourceMetadataFiles: [], localBookSources: [], publicMetadataSources: [], sourceStatus: "verified-storage-path",
          metadataStatus: "needs-enrichment", matchStatus: "unmatched", relatedBooks: [], relatedTopicLinks: [],
          cover: "", legacyPublicLink: null, legacyPrivateUrl: "https://example.test/private", catalogPath: "",
        },
      },
    });
    expect(normalized?.entries.audio.sourceProvider).toBe("mega");
    expect(normalized?.entries.audio.storagePath).toBe("Audio/Audiobooks/Book.m4b");
    expect(normalized?.entries.audio.sourceLink).toBe("https://example.test/private");
  });

  it("migrates pre-0.6.8 vendor-specific audiobook fields without data loss", () => {
    const normalized = normalizeAudiobookIndex({
      version: 1,
      generatedAt: "",
      entries: {
        audio: {
          id: "audio",
          sourceName: "Legacy Book.m4b",
          privateMegaPath: "Audio/Audiobooks/Legacy Book",
          privateMegaUrl: "https://storage.example/private",
          publicLink: "https://storage.example/public",
          karpathyLinks: ["topics/business.md"],
          mediaType: "audiobook",
          title: "Legacy Book",
          author: "Author",
          narrator: "",
          duration: "",
          audioFormats: ["MP3"],
          audioFileCount: 1,
          audioBytes: 100,
          audioLastModified: "",
          language: "",
          year: "",
          category: ["Audiobooks", "Business"],
          synopsis: "",
          synopsisStatus: "inventory-note",
          synopsisSource: "",
          sourceMetadataFiles: [],
          localBookSources: [],
          publicMetadataSources: [],
          sourceStatus: "verified-private-path",
          metadataStatus: "needs-enrichment",
          matchStatus: "unmatched",
          relatedBooks: [],
          cover: "",
          catalogPath: "_audiobooks/Legacy Book — Author.md",
        },
      },
    });
    const record = normalized?.entries.audio;
    expect(record?.sourceProvider).toBe("storage");
    expect(record?.sourceVisibility).toBe("public");
    expect(record?.sourceLink).toBe("https://storage.example/private");
    expect(record?.storagePath).toBe("Audio/Audiobooks/Legacy Book");
    expect(record?.legacyPrivatePath).toBe("Audio/Audiobooks/Legacy Book");
    expect(record?.legacyPrivateUrl).toBe("https://storage.example/private");
    expect(record?.legacyPublicLink).toBe("https://storage.example/public");
    expect(record?.relatedTopicLinks).toEqual(["topics/business.md"]);
  });

  it("scans a local audiobook folder without vendor-specific labels", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "local-audiobooks-"));
    const library = path.join(root, "Audiobooks", "Clean Architecture — Robert C. Martin");
    fs.mkdirSync(library, { recursive: true });
    fs.writeFileSync(path.join(library, "part01.m4b"), Buffer.from("audio"));
    fs.writeFileSync(path.join(library, "part02.mp3"), Buffer.from("audio"));
    const index = buildLocalAudiobookIndex({
      libraryPath: path.join(root, "Audiobooks"),
      catalogDir: "_audiobooks",
    });
    expect(Object.keys(index.entries)).toHaveLength(1);
    const record = Object.values(index.entries)[0];
    expect(record.title).toBe("Clean Architecture");
    expect(record.author).toBe("Robert C. Martin");
    expect(record.sourceProvider).toBe("local");
    expect(record.audioFileCount).toBe(2);
    expect(record.catalogPath).toContain("_audiobooks/Clean Architecture — Robert C. Martin.md");

    record.metadataStatus = "enriched-public-metadata";
    record.matchStatus = "matched";
    record.relatedBooks = ["book-hash"];
    record.description = "Sourced description";
    record.rating = 4.5;
    record.cover = "audiobook-cover.jpg";
    const rescanned = buildLocalAudiobookIndex({
      libraryPath: path.join(root, "Audiobooks"),
      catalogDir: "_audiobooks",
      previousIndex: index,
    });
    const preserved = Object.values(rescanned.entries)[0];
    expect(preserved.metadataStatus).toBe("enriched-public-metadata");
    expect(preserved.matchStatus).toBe("matched");
    expect(preserved.relatedBooks).toEqual(["book-hash"]);
  });

  it("creates a stable manual entry with a neutral storage link", () => {
    const first = upsertManualAudiobook(null, {
      title: "Manual Book",
      author: "Owner",
      storagePath: "/Cloud Audio/Manual Book",
      sourceLink: "https://storage.example/book",
      categories: ["Business"],
      synopsis: "Owner-provided synopsis.",
    }, "_audiobooks");
    expect(first.record.sourceProvider).toBe("web");
    expect(first.record.sourceVisibility).toBe("private");
    expect(first.record.storagePath).toBe("/Cloud Audio/Manual Book");
    expect(first.record.sourceLink).toBe("https://storage.example/book");
    expect(first.record.synopsisStatus).toBe("verified");
    expect(first.record.catalogPath).toBe("_audiobooks/Manual Book — Owner.md");

    const second = upsertManualAudiobook(first.index, {
      title: "manual book",
      author: "owner",
      storagePath: "/cloud audio/manual book",
    }, "_audiobooks");
    expect(Object.keys(second.index.entries)).toHaveLength(1);
    expect(second.record.synopsis).toBe("Owner-provided synopsis.");
    expect(second.record.cover).toBe("");
  });

  it("repairs encoded metadata without changing source links", () => {
    const repaired = normalizeAudiobookRecord({
      ...staging.items[0],
      sourceName: "Encoded &amp; Title.m4b",
      storagePath: staging.items[0].storagePath,
      legacyPrivatePath: staging.items[0].storagePath,
      title: "Encoded &amp; ï»¿Title",
      author: "ï»¿Author &amp; Co",
      narrator: "Narrator&amp;#174;",
      duration: "1 h", audioFormats: [], audioFileCount: 0, audioBytes: 0, audioLastModified: "",
      language: "", year: "", category: ["Audiobooks"], synopsis: "Synopsis &amp; facts",
      synopsisStatus: "verified", synopsisSource: "Test",
      sourceMetadataFiles: [], localBookSources: [], publicMetadataSources: [],
      sourceStatus: "manual", metadataStatus: "manual", matchStatus: "unmatched",
      relatedBooks: [], relatedTopicLinks: [], cover: "", legacyPublicLink: null,
      legacyPrivateUrl: null, catalogPath: "",
    });
    expect(repaired.title).toBe("Encoded & Title");
    expect(repaired.author).toBe("Author & Co");
    expect(repaired.narrator).toBe("Narrator®");
    expect(repaired.synopsis).toBe("Synopsis & facts");
  });
});
