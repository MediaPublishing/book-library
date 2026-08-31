import { describe, expect, it } from "vitest";
import { assignCatalogFileNames, catalogFileName, catalogLinkTarget, renderCatalogRecord } from "../src/catalog";
import type { BookRecord } from "../src/types";

function makeBook(overrides: Partial<BookRecord> = {}): BookRecord {
  return {
    hash: "abc123",
    file: "Sachbuch/Buch A.pdf",
    format: "pdf",
    size: 1000,
    mtime: 1,
    cover: "abc123.jpg",
    ingested: "2026-08-13T00:00:00Z",
    title: "Buch A",
    author: "Autorin",
    year: "1966",
    language: "de",
    publisher: "Verlag",
    isbn: "9783161484100",
    pages: "320",
    tags: ["geschichte", "biografie"],
    source: "local",
    summary: "Eine klare Synopsis über den Inhalt.",
    related: ["def456"],
    wikiStatus: "done",
    markdownPath: "_books/buch-a.md",
    ...overrides,
  };
}

describe("catalog note", () => {
  it("beginnt mit Synopsis und enthält Inhalt, ähnliche Bücher, verwandte Themen und Links", () => {
    const content = renderCatalogRecord(makeBook(), {
      language: "de",
      wikiDir: "_wiki",
      titles: { def456: "Buch B" },
    });
    const synopsisIndex = content.indexOf("**Synopsis**");
    const linksIndex = content.indexOf("## Links");
    const contentsIndex = content.indexOf("## Inhalt");
    const relatedIndex = content.indexOf("## Ähnliche Bücher");
    const topicsIndex = content.indexOf("## Verwandte Themen");
    expect(synopsisIndex).toBeGreaterThan(0);
    expect(synopsisIndex).toBeLessThan(linksIndex);
    expect(contentsIndex).toBeGreaterThan(synopsisIndex);
    expect(relatedIndex).toBeGreaterThan(contentsIndex);
    expect(topicsIndex).toBeGreaterThan(relatedIndex);
    expect(content).toContain("- [[def456|Buch B]]");
    expect(
      renderCatalogRecord(makeBook(), {
        language: "de",
        wikiDir: "_wiki",
        titles: { def456: "Buch B" },
        catalogPaths: { def456: "d".repeat(64) + ".md" },
      })
    ).toContain("- [[Buch B|Buch B]]");
    expect(
      renderCatalogRecord(makeBook(), {
        language: "de",
        wikiDir: "_wiki",
        titles: { def456: 'A | Very: Long * Book Title?' },
        catalogPaths: { def456: "d".repeat(64) + ".md" },
      })
    ).toContain("- [[A Very Long Book Title|A | Very: Long * Book Title?]]");
    expect(content).toContain("- [[_catalog/topics/biografie|biografie]]");
    expect(content).toContain("[[_wiki/buch-a/buch-a.md|Buch A — Wiki]]");
    expect(content).toContain("tags: [\"geschichte\",\"biografie\"]");
  });

  it("rendert Cover, Ratings, Beschreibung und Technik als unabhängige Geschwister", () => {
    const content = renderCatalogRecord(makeBook({
      description: "A sourced description.",
      sourceDescriptions: [{
        source: "google-books",
        url: "https://books.google.com/books?id=1",
        locale: "en",
        checkedAt: "2026-08-29T00:00:00Z",
        matchConfidence: 1,
        text: "A sourced description.",
        kind: "source",
      }],
      sourceRatings: [{
        source: "google-books",
        url: "https://books.google.com/books?id=1",
        locale: "en",
        checkedAt: "2026-08-29T00:00:00Z",
        matchConfidence: 1,
        value: 4.4,
        count: 17,
        status: "provider-reported",
      }],
      authorIdentity: { id: "open-library:OL123A", authorityIds: { "open-library": "OL123A" }, status: "matched" },
    }), { language: "en", wikiDir: "_wiki", topicsDir: "_catalog/topics" });

    const headings = content.split("\n").filter((line) => line.startsWith("## "));
    expect(headings).toEqual(expect.arrayContaining([
      "## Cover", "## Ratings", "## Description", "## Contents", "## Related books", "## Related topics", "## Technical details",
    ]));
    expect(content).toContain("![[covers/abc123.jpg|120]]");
    expect(content).toContain("[[_catalog/authors/open-library-ol123a|Autorin]]");
    expect(content).toContain("★★★★☆ 4.4/5 · 17 · [Google Books](https://books.google.com/books?id=1) · provider-reported");
    expect(content).toContain("Source: [Google Books](https://books.google.com/books?id=1)");
    expect(content).toContain("cssclasses: [book-library-catalog-note]");
    expect(content).toContain("> [!info]- Technical details");
  });

  it("lokalisiert Amazon-Suchlinks anhand der Buchsprache", () => {
    const content = renderCatalogRecord(makeBook({ language: "de" }), { language: "de", wikiDir: "_wiki" });
    expect(content).toContain("https://www.amazon.de/s?k=");
    expect(content).toContain("Amazon.de-Suche (unbestätigt)");
  });

  it("serialisiert externe Kategorien und Themes als gültige JSON-kompatible YAML-Werte", () => {
    const content = renderCatalogRecord(makeBook({
      tags: ['history "quoted"'],
      categories: ['Money: "modern"'],
      themes: ["Debt\ncycles"],
    }), { language: "en", wikiDir: "_wiki" });

    expect(content).toContain('tags: ["history \\"quoted\\""]');
    expect(content).toContain('categories: ["Money: \\"modern\\""]');
    expect(content).toContain('themes: ["Debt\\ncycles"]');
  });

  it("zeigt einen Hinweis, wenn noch kein Inhalt erfasst ist", () => {
    const content = renderCatalogRecord(makeBook({ wikiStatus: "none", related: [], tags: [] }), {
      language: "en",
      wikiDir: "_wiki",
      titles: {},
    });
    expect(content).toContain("No contents yet");
    expect(content).not.toContain("Related topics");
  });

  it("verwendet einen kollisionsfreien Wiki-Pfad, wenn einer vorhanden ist", () => {
    const content = renderCatalogRecord(makeBook({ wikiPath: "_wiki/buch-a--autor/buch-a.md" }), {
      language: "de",
      wikiDir: "_wiki",
      titles: {},
    });
    expect(content).toContain("[[_wiki/buch-a--autor/buch-a.md|Buch A — Wiki]]");
    expect(content).toContain("[[_wiki/buch-a--autor/buch-a-1.md|Buch A — Kapitel 1]]");
  });

  it("verwendet lesbare Dateinamen und hält technische IDs aus der Notiz heraus", () => {
    const book = makeBook({
      hash: "4facdc17ef13b1df472eafbabf574441eb809f72fb2c8972e4a694655e80502d",
      title: "$100M Money Models: How To Make Money",
      author: "Alex Hormozi",
    });
    const filename = catalogFileName(book);
    expect(filename).toBe("$100M Money Models How To Make Money — Alex Hormozi.md");
    expect(catalogLinkTarget(filename, "_catalog")).toBe(
      "_catalog/$100M Money Models How To Make Money — Alex Hormozi"
    );
    const content = renderCatalogRecord(book, { language: "de", wikiDir: "_wiki" });
    expect(content).toContain("# $100M Money Models: How To Make Money");
    expect(content).not.toContain(book.hash);
    expect(content).not.toContain("cover:");
    expect(content).not.toContain("file:");
  });

  it("erzeugt keine von Obsidian ignorierten Dot-Dateien", () => {
    const book = makeBook({
      title: "...and forgive them their debts",
      author: "Michael Hudson",
      catalogPath: "...and forgive them their debts — Michael Hudson.md",
    });

    expect(catalogFileName(book)).toBe("and forgive them their debts — Michael Hudson.md");
  });

  it("löst Namenskollisionen reproduzierbar auf", () => {
    const first = makeBook({ hash: "a", title: "Gleicher Titel", author: "Autor" });
    const second = makeBook({ hash: "b", title: "Gleicher Titel", author: "Autor" });
    expect(assignCatalogFileNames([second, first], (book) => book.hash)).toEqual({
      a: "Gleicher Titel — Autor.md",
      b: "Gleicher Titel — Autor (2).md",
    });
  });
});
