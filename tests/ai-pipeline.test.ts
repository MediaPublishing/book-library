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
});
