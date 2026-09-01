import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AiPipeline } from "../src/ai";
import { DEFAULT_SETTINGS, type BookRecord } from "../src/types";

function book(hash: string, title: string): BookRecord {
  return {
    hash,
    file: `${hash}.epub`,
    format: "epub",
    size: 1,
    mtime: 1,
    cover: "",
    ingested: "",
    title,
    author: "Test Autor",
    year: "",
    language: "de",
    publisher: "",
    isbn: "",
    pages: "",
    tags: ["test"],
    source: "local",
    summary: "",
    related: [],
    wikiStatus: "none",
    markdownPath: "",
  };
}

describe("ai pipeline smoke", () => {
  it("erzeugt Wiki-Seiten mit lokalem Modell-Befehl und cached das Ergebnis", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-ai-"));
    const script = path.join(root, "echo-model.sh");
    fs.writeFileSync(
      script,
      "#!/bin/sh\nprintf '%s\\n' \"## Kernaussage\n$1\"\n",
      { mode: 0o755 }
    );
    const markdown = path.join(root, "buch.md");
    fs.writeFileSync(markdown, "Kapitel 1\n\nWichtige Methode.\n\n".repeat(40));
    const settings = {
      ...DEFAULT_SETTINGS,
      aiProvider: "local" as const,
      localModelCommand: `bash ${script} {prompt}`,
      maxTokensPerBook: 4000,
      budgetCents: 100,
    };
    const pipeline = new AiPipeline(settings, path.join(root, "_wiki"), {
      spentCents: 0,
      limitCents: 100,
    });
    const result = await pipeline.generateWiki(book("hash1", "Testbuch"), markdown);
    expect(result.pages.length).toBeGreaterThan(1);
    expect(fs.existsSync(path.join(root, "_wiki", ".wiki-cache.json"))).toBe(true);
    const cache = JSON.parse(fs.readFileSync(path.join(root, "_wiki", ".wiki-cache.json"), "utf8"));
    expect(Object.keys(cache).length).toBeGreaterThan(0);
    expect(result.provider).toBe("local");
    expect(result.costCents).toBe(0);
  });

  it("trennt Wiki-Cache-Einträge nach Ausgabesprache", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-ai-language-"));
    const script = path.join(root, "echo-model.sh");
    fs.writeFileSync(script, "#!/bin/sh\nprintf '%s\\n' '## Related books'\n", { mode: 0o755 });
    const cacheDir = path.join(root, "_wiki");
    const settings = {
      ...DEFAULT_SETTINGS,
      aiProvider: "local" as const,
      localModelCommand: `bash ${script} {prompt}`,
      maxTokensPerBook: 4000,
      budgetCents: 100,
    };
    const source = "One source-backed chapter.";
    await new AiPipeline(settings, cacheDir, { spentCents: 0, limitCents: 100 }, "en")
      .generateWikiFromText(book("same-hash", "Same Book"), source);
    await new AiPipeline(settings, cacheDir, { spentCents: 0, limitCents: 100 }, "de")
      .generateWikiFromText(book("same-hash", "Same Book"), source);

    const cache = JSON.parse(fs.readFileSync(path.join(cacheDir, ".wiki-cache.json"), "utf8"));
    expect(Object.keys(cache)).toHaveLength(2);
    expect(Object.keys(cache).some((key) => key.includes("|en|"))).toBe(true);
    expect(Object.keys(cache).some((key) => key.includes("|de|"))).toBe(true);
  });

  it("schreibt kontrollierte Buch-Querverweise genau einmal auf die Wiki-Hauptseite", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-ai-links-"));
    const script = path.join(root, "echo-model.sh");
    fs.writeFileSync(script, "#!/bin/sh\nprintf '%s\\n' '## Similar books' '- [[Invented Book]]'\n", { mode: 0o755 });
    const settings = {
      ...DEFAULT_SETTINGS,
      aiProvider: "local" as const,
      localModelCommand: `bash ${script} {prompt}`,
      maxTokensPerBook: 4000,
      budgetCents: 100,
    };
    const result = await new AiPipeline(settings, path.join(root, "_wiki"), {
      spentCents: 0,
      limitCents: 100,
    }, "en").generateWikiFromText(book("links", "Linked Book"), "One source-backed chapter.", [{
      target: "_catalog/Deep Work — Cal Newport",
      title: "Deep Work",
      reasons: ["Shared theme: focus"],
    }]);

    const combined = result.pages.map(({ content }) => content).join("\n");
    expect(combined.match(/^## Related books$/gm)).toHaveLength(1);
    expect(combined).not.toContain("Invented Book");
    expect(result.pages.at(-1)?.content).toContain("[[_catalog/Deep Work — Cal Newport|Deep Work]]");
  });
});
