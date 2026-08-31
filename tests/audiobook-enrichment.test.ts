import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { enrichAudiobookRecord, enrichAudiobooks, type AudiobookEnrichmentProvider } from "../src/audiobook-enrichment";
import type { AudiobookRecord } from "../src/types";

function record(overrides: Partial<AudiobookRecord> = {}): AudiobookRecord {
  return {
    id: "audio-1", sourceName: "A.m4b", sourceProvider: "local", sourceVisibility: "local",
    storagePath: "/audio/A.m4b", sourceLink: null, legacyPrivatePath: "/audio/A.m4b", mediaType: "audiobook",
    title: "A Book", author: "An Author", narrator: "", duration: "", audioFormats: ["M4B"], audioFileCount: 1,
    audioBytes: 12, audioLastModified: "", language: "en", year: "", category: ["Audiobooks"], synopsis: "",
    synopsisStatus: "inventory-note", synopsisSource: "", sourceMetadataFiles: [], localBookSources: [],
    sourceStatus: "verified-local-path", metadataStatus: "needs-enrichment", matchStatus: "unmatched",
    relatedBooks: [], relatedTopicLinks: [], cover: "", legacyPublicLink: null, legacyPrivateUrl: null,
    publicMetadataSources: [], catalogPath: "", ...overrides,
  };
}

describe("audiobook enrichment", () => {
  it("applies native public metadata and persists a deterministic hashed cover", async () => {
    const coversDir = fs.mkdtempSync(path.join(os.tmpdir(), "audiobook-covers-"));
    const provider: AudiobookEnrichmentProvider = {
      fetchByTitleAuthor: async () => ({
        title: "A Book", author: "An Author", description: "A sourced description.", rating: 4.6, ratingsCount: 321,
        reviews: [{ source: "public", author: "Reader", rating: 5, text: "Excellent." }],
        sourceRatings: [{ source: "audible", url: "https://audible.example/a", locale: "en-US", checkedAt: "2026-08-31", matchConfidence: 1, value: 4.6, count: 321, status: "provider-reported" }],
        sourceDescriptions: [{ source: "audible", url: "https://audible.example/a", locale: "en-US", checkedAt: "2026-08-31", matchConfidence: 1, text: "A sourced description.", kind: "source" }],
        externalIdentities: [{ source: "audible", url: "https://audible.example/a", locale: "en-US", checkedAt: "2026-08-31", matchConfidence: 1, editionId: "aud-1" }],
        source: "audible", publicMetadataSources: ["https://audible.example/a"],
      }),
      downloadCover: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]),
    };
    const enriched = await enrichAudiobookRecord(record(), provider, { coversDir });
    expect(enriched.description).toBe("A sourced description.");
    expect(enriched.rating).toBe(4.6);
    expect(enriched.ratingsCount).toBe(321);
    expect(enriched.reviews?.[0].text).toBe("Excellent.");
    expect(enriched.enrichmentSource).toBe("audible");
    expect(enriched.enrichmentState).toBe("success");
    expect(enriched.publicMetadataSources).toEqual(["https://audible.example/a"]);
    expect(enriched.cover).toMatch(/^audiobook-[a-f0-9]{64}\.png$/);
    expect(fs.existsSync(path.join(coversDir, enriched.cover))).toBe(true);
  });

  it("does not re-query completed records and never applies ambiguous metadata", async () => {
    let calls = 0;
    const provider: AudiobookEnrichmentProvider = {
      fetchByTitleAuthor: async () => {
        calls += 1;
        return { description: "Wrong edition", enrichmentState: "ambiguous", source: "provider" };
      },
    };
    const completed = record({ id: "done", enrichmentState: "success", description: "Trusted", rating: 4, cover: "trusted.jpg" });
    const pending = record({ id: "pending" });
    const [unchanged, ambiguous] = await enrichAudiobooks([completed, pending], provider, { maxRecords: 1 });
    expect(calls).toBe(1);
    expect(unchanged.description).toBe("Trusted");
    expect(ambiguous.description).toBeUndefined();
    expect(ambiguous.enrichmentState).toBe("ambiguous");
  });

  it("retries successful but incomplete records on later scans", async () => {
    let calls = 0;
    const provider: AudiobookEnrichmentProvider = {
      fetchByTitleAuthor: async () => {
        calls += 1;
        return { title: "A Book", author: "An Author", description: "Now complete", rating: 4.2, source: "public" };
      },
    };
    const [enriched] = await enrichAudiobooks([record({ enrichmentState: "success" })], provider);
    expect(calls).toBe(1);
    expect(enriched.description).toBe("Now complete");
  });

  it("rejects metadata for a different work", async () => {
    const provider: AudiobookEnrichmentProvider = {
      fetchByTitleAuthor: async () => ({ title: "Another Book", author: "Another Author", description: "Wrong", rating: 5, source: "public" }),
    };
    const enriched = await enrichAudiobookRecord(record(), provider);
    expect(enriched.description).toBeUndefined();
    expect(enriched.enrichmentState).toBe("ambiguous");
  });

  it("keeps metadata usable when the optional cover directory cannot be created", async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "audiobook-cover-file-"));
    const coverPath = path.join(parent, "not-a-directory");
    fs.writeFileSync(coverPath, "occupied", "utf8");
    const provider: AudiobookEnrichmentProvider = {
      fetchByTitleAuthor: async () => ({ title: "A Book", author: "An Author", description: "Still usable", rating: 4, source: "public", coverUrl: "https://covers.openlibrary.org/test.jpg" }),
      downloadCover: async () => Buffer.from([0xff, 0xd8, 0xff]),
    };
    const enriched = await enrichAudiobookRecord(record(), provider, { coversDir: coverPath });
    expect(enriched.description).toBe("Still usable");
    expect(enriched.cover).toBe("");
  });

  it("isolates malformed provider payloads and finite-bounds options", async () => {
    let calls = 0;
    const provider: AudiobookEnrichmentProvider = {
      fetchByTitleAuthor: async () => {
        calls += 1;
        return { title: "A Book", author: "An Author", sourceRatings: [null] as never, source: "public" };
      },
    };
    const [failed] = await enrichAudiobooks([record()], provider, { maxRecords: Number.POSITIVE_INFINITY, concurrency: Number.NaN });
    expect(calls).toBe(1);
    expect(failed.enrichmentState).toBe("failed");
  });

  it("does not overwrite better local fields and is bounded to usable identities", async () => {
    let calls = 0;
    const provider: AudiobookEnrichmentProvider = {
      fetchByTitleAuthor: async () => { calls += 1; return { title: "A Book", author: "An Author", description: "remote", rating: 3, source: "remote" }; },
      downloadCover: async () => null,
    };
    const existing = record({ description: "local", rating: 5, ratingsCount: 900, enrichmentSource: "local", enrichmentState: "partial" });
    const results = await enrichAudiobooks([existing, record({ id: "missing", title: "", author: "" }), record({ id: "second", title: "Second", author: "Author" })], provider, { maxRecords: 1 });
    expect(calls).toBe(1);
    expect(results[0].description).toBe("local");
    expect(results[0].rating).toBe(5);
    expect(results[0].ratingsCount).toBe(900);
    expect(results[0].enrichmentSource).toContain("local");
    expect(results[1].enrichmentState).toBeUndefined();
  });
});
