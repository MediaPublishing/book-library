import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  AiPipeline,
  buildMetadataWiki,
  buildWikiPrompt,
  enforceWikiCrossReferences,
  estimateCostCents,
  hasMetadataWikiSource,
  readOptionalWikiMarkdown,
  renderSafeWikiLink,
  splitWikiSections,
} from "../src/ai";
import { DEFAULT_SETTINGS, type BookRecord } from "../src/types";
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

  it("gibt der AI nur geprüfte Buchziele für Querverweise frei", () => {
    const record = {
      hash: "source",
      file: "",
      format: "pdf" as const,
      size: 0,
      mtime: 0,
      cover: "",
      ingested: "",
      title: "Source Book",
      author: "Author",
      year: "",
      language: "en",
      publisher: "",
      isbn: "",
      pages: "",
      tags: [],
      source: "local",
      summary: "",
      related: [],
      wikiStatus: "none" as const,
      markdownPath: "",
    };
    const prompt = buildWikiPrompt(record, "A section.", "en", [{
      target: "_catalog/Deep Work — Cal Newport",
      title: "Deep Work",
      reasons: ["Shared theme: focus"],
    }]);

    expect(prompt).toContain("[[_catalog/Deep Work — Cal Newport|Deep Work]]");
    expect(prompt).toContain("Shared theme: focus");
    expect(prompt).toMatch(/only.*approved|approved.*only/i);
  });

  it("ersetzt erfundene Buch-Querverweise durch die geprüfte Liste", () => {
    const generated = [
      "## Concepts",
      "- [[Focus]] is useful.",
      "",
      "## Cross-references to other books",
      "- [[Invented Book]]",
    ].join("\n");
    const result = enforceWikiCrossReferences(generated, [{
      target: "_catalog/Deep Work — Cal Newport",
      title: "Deep Work",
      reasons: ["Shared theme: focus"],
    }], "en");

    expect(result).toContain("[[Focus]]");
    expect(result).toContain("[[_catalog/Deep Work — Cal Newport|Deep Work]]");
    expect(result).not.toContain("Invented Book");
  });

  it("erkennt auch abweichende Querverweis-Überschriften", () => {
    const generated = "## Book cross references\n\n- [[Invented Book]]";
    const result = enforceWikiCrossReferences(generated, [{
      target: "_catalog/Deep Work — Cal Newport",
      title: "Deep Work",
      reasons: ["Shared theme: focus"],
    }], "en");

    expect(result).toContain("[[_catalog/Deep Work — Cal Newport|Deep Work]]");
    expect(result).not.toContain("Invented Book");
  });

  it("kontrolliert auch die deutsche Standardvariante Ähnliche Bücher", () => {
    const generated = "## Ähnliche Bücher\n\n- [[Erfundenes Buch]]";
    const result = enforceWikiCrossReferences(generated, [{
      target: "_catalog/Deep Work — Cal Newport",
      title: "Deep Work",
      reasons: ["Gemeinsames Thema: Fokus"],
    }], "de");

    expect(result).toContain("[[_catalog/Deep Work — Cal Newport|Deep Work]]");
    expect(result).not.toContain("Erfundenes Buch");
    expect(result.match(/^## Verwandte Bücher$/gm)).toHaveLength(1);
  });

  it("entfernt alle doppelten Buch-Querverweisabschnitte und erhält folgende H2-Blöcke", () => {
    const generated = [
      "## Related books",
      "- [[Invented One]]",
      "",
      "## Concepts",
      "- [[Focus]]",
      "",
      "## Book cross references",
      "- [[Invented Two]]",
      "",
      "## Quotes",
      "> Source-backed quote",
    ].join("\n");
    const result = enforceWikiCrossReferences(generated, [{
      target: "_catalog/Deep Work — Cal Newport",
      title: "Deep Work",
      reasons: ["Shared theme: focus"],
    }], "en");

    expect(result.match(/^## Related books$/gm)).toHaveLength(1);
    expect(result).not.toMatch(/Invented One|Invented Two/);
    expect(result).toContain("- [[Focus]]\n\n## Quotes");
    expect(result).toContain("Source-backed quote\n\n## Related books");
  });

  it("schreibt für eine leere Whitelist genau den kontrollierten Leerzustand", () => {
    const result = enforceWikiCrossReferences("## Concepts\n\n- [[Focus]]", [], "de");
    expect(result).toContain("## Verwandte Bücher\n\n- Keine geprüften Querverweise.");
    expect(result.match(/^## Verwandte Bücher$/gm)).toHaveLength(1);
  });

  it("bereinigt Wiki-Ziele und Aliasse gegen Link- und Zeileninjektion", () => {
    expect(renderSafeWikiLink("_catalog/Bad]]|Target\n", "Title|Alias]]\r\nInjected")).toBe(
      "[[_catalog/BadTarget|TitleAliasInjected]]"
    );
  });

  it("behandelt fehlendes Markdown als leer, aber andere Lesefehler als Fehler", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-markdown-"));
    expect(readOptionalWikiMarkdown(path.join(root, "missing.md"))).toBe("");
    expect(() => readOptionalWikiMarkdown(root)).toThrow(/Markdown-Datei konnte nicht gelesen werden/);
  });

  it("liefert bei fehlendem generateWiki-Pfad den bisherigen Domänenfehler", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-missing-wiki-"));
    const pipeline = new AiPipeline(
      { ...DEFAULT_SETTINGS, aiProvider: "local", localModelCommand: "printf ok" },
      root,
      { spentCents: 0, limitCents: 100 },
      "de",
    );
    const record = {
      hash: "missing",
      file: "missing.epub",
      format: "epub" as const,
      size: 0,
      mtime: 0,
      cover: "",
      ingested: "",
      title: "Missing",
      author: "",
      year: "",
      language: "de",
      publisher: "",
      isbn: "",
      pages: "",
      tags: [],
      source: "local",
      summary: "",
      related: [],
      wikiStatus: "none" as const,
      markdownPath: "",
    };

    await expect(pipeline.generateWiki(record, path.join(root, "missing.md"))).rejects.toThrow(
      /Kein Markdown-Text vorhanden/
    );
  });

  it("integriert geprüfte Querverweise auch im Metadaten-Wiki", () => {
    const record = {
      hash: "metadata-links",
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
      summary: "Eine belegte Beschreibung.",
      related: [],
      wikiStatus: "none" as const,
      markdownPath: "",
    };
    const wiki = buildMetadataWiki(record, "_wiki", "de", true, [{
      target: "_catalog/Deep Work — Cal Newport",
      title: "Deep Work",
      reasons: ["Gemeinsames Thema: Fokus"],
    }]);

    expect(wiki.pages[0].content).toContain("## Verwandte Bücher");
    expect(wiki.pages[0].content).toContain("[[_catalog/Deep Work — Cal Newport|Deep Work]]");
    expect(wiki.pages[0].content).toContain("Gemeinsames Thema: Fokus");
  });
});
