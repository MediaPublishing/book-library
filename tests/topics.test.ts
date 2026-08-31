import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { bookTopicLinks, writeBookTopicMocs } from "../src/topics";
import type { BookRecord } from "../src/types";

function makeBook(hash: string, title: string, author: string, tags: string[]): BookRecord {
  return {
    hash,
    file: `${title}.epub`,
    format: "epub",
    size: 1,
    mtime: 1,
    cover: "",
    ingested: "2026-08-23T00:00:00Z",
    title,
    author,
    year: "",
    language: "",
    publisher: "",
    isbn: "",
    pages: "",
    tags,
    source: "local",
    summary: "",
    related: [],
    wikiStatus: "none",
    markdownPath: "",
    catalogPath: `${title} — ${author}.md`,
  };
}

describe("book topic MOCs", () => {
  it("erzeugt kollisionsfreie thematische Sammelseiten mit Buchlinks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-topics-"));
    const topics = path.join(root, "topics");
    const books = [
      makeBook("a", "Buch A", "Autorin A", ["Geschichte", "Biografie"]),
      makeBook("b", "Buch B", "Autorin B", ["geschichte"]),
      makeBook("c", "Buch C", "Autorin C", []),
    ];

    expect(writeBookTopicMocs(books, topics, "de", "_catalog")).toBe(2);
    const german = fs.readFileSync(path.join(topics, "geschichte.md"), "utf8");
    expect(german).toContain("# Geschichte");
    expect(german).toContain("## Verwandte Bücher");
    expect(german).toContain("[[_catalog/Buch A — Autorin A|Buch A]]");
    expect(german).toContain("[[_catalog/Buch B — Autorin B|Buch B]]");
    expect(fs.existsSync(path.join(topics, "biografie.md"))).toBe(true);
    expect(bookTopicLinks(books[0], "_catalog/topics")).toEqual([
      "_catalog/topics/geschichte.md",
      "_catalog/topics/biografie.md",
    ]);
  });

  it("nutzt englische Überschriften und entfernt keine bestehende Seite bei leerem Ergebnis", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-topics-empty-"));
    const topics = path.join(root, "topics");
    writeBookTopicMocs([makeBook("a", "Buch A", "Autorin A", ["AI"])], topics, "en", "_catalog");
    expect(fs.readFileSync(path.join(topics, "ai.md"), "utf8")).toContain("## Related books");

    expect(writeBookTopicMocs([], topics, "en", "_catalog")).toBe(0);
    expect(fs.existsSync(path.join(topics, "ai.md"))).toBe(true);
  });

  it("bewahrt nutzereigene Topic-Seiten und berücksichtigt Kategorien und Themes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-topics-owned-"));
    const topics = path.join(root, "topics");
    fs.mkdirSync(topics, { recursive: true });
    const userTopic = path.join(topics, "wirtschaft.md");
    fs.writeFileSync(userTopic, "# Meine private Wirtschaftsnotiz\n", "utf8");
    const record = {
      ...makeBook("a", "Buch A", "Autorin A", ["   "]),
      categories: ["Wirtschaft"],
      themes: ["Geldsystem"],
    };

    expect(writeBookTopicMocs([record], topics, "de", "_catalog")).toBe(1);
    expect(fs.readFileSync(userTopic, "utf8")).toBe("# Meine private Wirtschaftsnotiz\n");
    expect(fs.readFileSync(path.join(topics, "geldsystem.md"), "utf8")).toContain("book-library-generated: true");
    expect(bookTopicLinks(record, "_catalog/topics")).toEqual([
      "_catalog/topics/wirtschaft.md",
      "_catalog/topics/geldsystem.md",
    ]);
  });
});
