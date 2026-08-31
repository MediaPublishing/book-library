import { describe, expect, it } from "vitest";
import {
  AI_COVER_GRID,
  buildCoverSheetPrompt,
  coverTileRect,
  createCoverBatchManifest,
  estimateAiCoverCostCents,
  hasUsableCoverIdentity,
} from "../src/ai-covers";
import type { BookRecord } from "../src/types";

function makeBook(title: string, author = "", tags: string[] = []): BookRecord {
  return {
    hash: title,
    file: `${title}.epub`,
    format: "epub",
    size: 1,
    mtime: 1,
    cover: "",
    ingested: "",
    title,
    author,
    year: "1966",
    language: "de",
    publisher: "",
    isbn: "",
    pages: "",
    tags,
    source: "local",
    summary: "",
    related: [],
    wikiStatus: "none",
    markdownPath: "",
  };
}

describe("ai covers", () => {
  it("baut einen 4x4-Prompt mit Titel, Autor und Genre", () => {
    const books = Array.from({ length: 16 }, (_, index) =>
      makeBook(`Buch ${index + 1}`, "Autorin", ["geschichte"])
    );
    const prompt = buildCoverSheetPrompt(books, "de");
    expect(prompt).toContain("4x4");
    expect(prompt).toContain('Tile 1: title "Buch 1", author "Autorin"');
    expect(prompt).toContain('genre "geschichte"');
    expect(prompt).toContain("Tile 16");
  });

  it("erstellt einen manifestierten, streng 16er Cover-Batch", () => {
    const books = Array.from({ length: 16 }, (_, index) => makeBook(`Buch ${index + 1}`, "Autorin"));
    const manifest = createCoverBatchManifest("batch-001", books, "de", "2026-08-21T00:00:00.000Z");
    expect(manifest.grid).toEqual(AI_COVER_GRID);
    expect(manifest.items).toHaveLength(16);
    expect(manifest.items[15]).toMatchObject({ slot: 16, title: "Buch 16", author: "Autorin" });
  });

  it("lehnt fehlende oder Platzhalter-Autoren vor der Generierung ab", () => {
    expect(hasUsableCoverIdentity(makeBook("Buch", "-"))).toBe(false);
    expect(() => createCoverBatchManifest("batch-bad", Array.from({ length: 16 }, (_, index) => makeBook(`Buch ${index + 1}`, index === 3 ? "-" : "Autorin")))).toThrow("Unvollständige Cover-Metadaten");
  });

  it("berechnet Kachel-Geometrie für ein Grid", () => {
    expect(coverTileRect(0, 2, 2, 1000, 1000)).toEqual({ x: 0, y: 0, w: 500, h: 500 });
    expect(coverTileRect(3, 2, 2, 1000, 1000)).toEqual({ x: 500, y: 500, w: 500, h: 500 });
  });

  it("schätzt Kosten konservativ", () => {
    expect(estimateAiCoverCostCents(16)).toBe(64);
  });
});
