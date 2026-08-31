import { describe, expect, it } from "vitest";
import {
  chunkText,
  colorForString,
  estimateTokens,
  genreOf,
  initials,
  normalizeDisplayText,
  sortAudiobooks,
  slugify,
  sortBooks,
} from "../src/util";

describe("util", () => {
  it("slugify erzeugt sichere Slugs", () => {
    expect(slugify("A history of smoking: Corti!")).toBe("a-history-of-smoking-corti");
    expect(slugify("Über Bücher 2026")).toBe("uber-bucher-2026");
  });

  it("estimateTokens ist konservativ", () => {
    expect(estimateTokens("abc")).toBe(1);
    expect(estimateTokens("a".repeat(1000))).toBe(250);
  });

  it("chunkText respektiert Token-Limit und Absatzgrenzen", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Absatz ${i} `.repeat(20)).join("\n\n");
    const chunks = chunkText(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => estimateTokens(c) <= 120)).toBe(true);
  });

  it("initials bildet stabile Initialen", () => {
    expect(initials("A history of smoking")).toBe("AS");
    expect(initials("Egon Caesar Corti")).toBe("EC");
    expect(initials("Über Bücher")).toBe("ÜB");
    expect(initials("   ")).toBe("?");
  });

  it("colorForString liefert deterministische Farben", () => {
    expect(colorForString("Titel A")).toBe(colorForString("Titel A"));
    expect(colorForString("Titel A")).not.toBe(colorForString("Titel B"));
  });

  it("normalisiert Metadaten-Entities, BOM-Artefakte und Whitespace", () => {
    expect(normalizeDisplayText("Carolyn D. &amp; Lynnette A. Berdanier")).toBe(
      "Carolyn D. & Lynnette A. Berdanier"
    );
    expect(normalizeDisplayText("ï»¿ï»¿Carolyn D.ï»¿ ï»¿Berdanierï»¿ï»¿; and ï»¿ï»¿Lynneï»¿")).toBe(
      "Carolyn D. Berdanier; and Lynne"
    );
    expect(normalizeDisplayText("For Dummies&amp;#174;")).toBe("For Dummies®");
    expect(normalizeDisplayText("<em>Good</em> &amp;  Clean </p>")).toBe("Good & Clean");
  });

  it("sortBooks sortiert nach Titel, Autor, Jahr, Größe und Änderungsdatum", () => {
    const books = [
      { title: "Zebra", author: "Ada", year: "2001", size: 10, mtime: 1 },
      { title: "Alpha", author: "Bob", year: "1999", size: 40, mtime: 3 },
      { title: "Mitte", author: "Ada", year: "", size: 20, mtime: 2 },
    ];
    expect(sortBooks(books, "title", "de").map((b) => b.title)).toEqual(["Alpha", "Mitte", "Zebra"]);
    expect(sortBooks(books, "author", "de").map((b) => b.author)).toEqual(["Ada", "Ada", "Bob"]);
    expect(sortBooks(books, "year", "de").map((b) => b.title)).toEqual(["Zebra", "Alpha", "Mitte"]);
    expect(sortBooks(books, "size", "de").map((b) => b.title)).toEqual(["Alpha", "Mitte", "Zebra"]);
    expect(sortBooks(books, "newest", "de").map((b) => b.title)).toEqual(["Alpha", "Mitte", "Zebra"]);
  });

  it("sortBooks sortiert nach Genre und danach alphabetisch", () => {
    const books = [
      { title: "Zebra", author: "Ada", year: "2001", size: 10, mtime: 1, tags: ["geschichte"] },
      { title: "Alpha", author: "Bob", year: "1999", size: 40, mtime: 3, tags: ["biologie"] },
      { title: "Mitte", author: "Ada", year: "", size: 20, mtime: 2, tags: ["biologie"] },
      { title: "Ohne", author: "", year: "", size: 1, mtime: 4, tags: [] },
    ];
    expect(sortBooks(books, "genre", "de").map((b) => b.title)).toEqual([
      "Alpha",
      "Mitte",
      "Zebra",
      "Ohne",
    ]);
    expect(genreOf(books[0])).toBe("geschichte");
    expect(genreOf(books[3])).toBe("unknown");
  });

  it("sortAudiobooks unterstützt dieselben Sortierungen wie Bücher", () => {
    const audiobooks = [
      { id: "3", title: "Zebra", author: "Ada", year: "2001", audioBytes: 10, audioLastModified: "2026-01-01T00:00:00Z", category: ["Wissenschaft"] },
      { id: "2", title: "Alpha", author: "Bob", year: "1999", audioBytes: 40, audioLastModified: "2026-03-01T00:00:00Z", category: ["Business"] },
      { id: "1", title: "Mitte", author: "Ada", year: "", audioBytes: 20, audioLastModified: "", category: ["Business"] },
    ];
    expect(sortAudiobooks(audiobooks, "title", "de").map((item) => item.id)).toEqual(["2", "1", "3"]);
    expect(sortAudiobooks(audiobooks, "author", "de").map((item) => item.id)).toEqual(["1", "3", "2"]);
    expect(sortAudiobooks(audiobooks, "year", "de").map((item) => item.id)).toEqual(["3", "2", "1"]);
    expect(sortAudiobooks(audiobooks, "size", "de").map((item) => item.id)).toEqual(["2", "1", "3"]);
    expect(sortAudiobooks(audiobooks, "newest", "de").map((item) => item.id)).toEqual(["2", "3", "1"]);
    expect(sortAudiobooks(audiobooks, "genre", "de").map((item) => item.id)).toEqual(["2", "1", "3"]);
  });
});
