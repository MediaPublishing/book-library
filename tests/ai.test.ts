import { describe, expect, it } from "vitest";
import { buildMetadataWiki, buildWikiPrompt, estimateCostCents, hasMetadataWikiSource, splitWikiSections } from "../src/ai";
import type { BookRecord } from "../src/types";
import { chunkText } from "../src/util";

describe("ai pipeline helpers", () => {
  it("baut einen strukturierten Karpathy-Prompt", () => {
    const prompt = buildWikiPrompt(
      {
        hash: "h",
        file: "",
        format: "pdf",
        size: 0,
        mtime: 0,
        cover: "",
        ingested: "",
        title: "Testbuch",
        author: "Autorin",
        year: "",
        language: "",
        publisher: "",
        isbn: "",
        pages: "",
        tags: [],
        source: "",
        summary: "",
        related: [],
        wikiStatus: "none",
        markdownPath: "",
      },
      "Ein Abschnitt über Methoden."
    );
    expect(prompt).toContain("## Concepts");
    expect(prompt).toContain("Testbuch");
  });

  it("schätzt OpenRouter-Kosten", () => {
    expect(estimateCostCents(1_000_000, "openrouter")).toBe(250);
    expect(estimateCostCents(500_000, "codex")).toBe(0);
  });

  it("chunked Texte bleiben unter dem Token-Limit", () => {
    const text = "Wort ".repeat(20000);
    for (const chunk of chunkText(text, 2000)) {
      expect(chunk.length).toBeLessThanOrEqual(2000 * 4);
    }
  });

  it("erzeugt für reine Metadaten ein lokales, belegtes Wiki ohne AI-Kosten", () => {
    const record: BookRecord = {
      hash: "metadata-wiki",
      file: "",
      format: "epub",
      size: 0,
      mtime: 0,
      cover: "",
      ingested: "",
      title: "Testbuch",
      author: "Autorin",
      year: "",
      language: "de",
      publisher: "",
      isbn: "",
      pages: "",
      tags: [],
      source: "google-books",
      summary: "Eine belegte Zusammenfassung.",
      categories: ["Strategie"],
      themes: ["Entscheidungen"],
      reviews: [{ source: "local", author: "Leserin", rating: 4, text: "Hilfreich." }],
      enrichmentSource: "google-books",
      related: [],
      wikiStatus: "none",
      markdownPath: "",
    };

    expect(hasMetadataWikiSource(record)).toBe(true);
    const wiki = buildMetadataWiki(record, "_wiki", "de");
    expect(wiki).toMatchObject({ provider: "metadata", tokens: 0, costCents: 0 });
    expect(wiki.pages).toHaveLength(1);
    expect(wiki.pages[0].file).toBe("_wiki/testbuch/testbuch.md");
    expect(wiki.pages[0].content).toContain("## Kernideen");
    expect(wiki.pages[0].content).toContain("- Entscheidungen");
    expect(wiki.pages[0].content).toContain("## Lokale Rezensionen");
  });

  it("unterdrückt lokale Rezensionen im Metadaten-Wiki, wenn sie deaktiviert sind", () => {
    const record = {
      hash: "reviews-disabled",
      file: "",
      format: "epub" as const,
      size: 0,
      mtime: 0,
      cover: "",
      ingested: "",
      title: "Testbuch",
      author: "Autorin",
      year: "",
      language: "de",
      publisher: "",
      isbn: "",
      pages: "",
      tags: [],
      source: "local",
      summary: "Belegte Beschreibung.",
      reviews: [{ source: "local", author: "Leserin", rating: 4, text: "Privat." }],
      related: [],
      wikiStatus: "none" as const,
      markdownPath: "",
    };

    const wiki = buildMetadataWiki(record, "_wiki", "de", false);
    expect(wiki.pages[0].content).not.toContain("Lokale Rezensionen");
    expect(wiki.pages[0].content).not.toContain("Privat.");
  });

  it("erhält Einleitung und Kapitelinhalt beim Aufteilen für Wiki-Läufe", () => {
    const sections = splitWikiSections("Einleitung.\n\n# Erstes Kapitel\nText eins.\n\n## Zweites Kapitel\nText zwei.", 500);
    expect(sections).toEqual([
      { title: "Introduction", text: "Einleitung." },
      { title: "Erstes Kapitel", text: "Text eins." },
      { title: "Zweites Kapitel", text: "Text zwei." },
    ]);
  });
});
