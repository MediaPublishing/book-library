import { describe, expect, it } from "vitest";
import { computeRelatedBooks, extractTagsFromPath } from "../src/related";
import type { BookRecord } from "../src/types";

function book(hash: string, title: string, author: string, tags: string[]): BookRecord {
  return {
    hash,
    file: `${hash}.pdf`,
    format: "pdf",
    size: 1,
    mtime: 1,
    cover: "",
    ingested: "",
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
  };
}

describe("related", () => {
  it("findet Related Books über Autor, Kategorien und Themen", () => {
    const target = book("a", "History of Rome", "Autor X", ["geschichte", "antike"]);
    target.categories = ["Geschichte"];
    const all = [
      target,
      book("b", "Rome's Empire", "Autor X", ["geschichte"]),
      book("c", "Cooking Basics", "Autor Y", ["kochbuch"]),
      book("d", "The Romans", "Autor Z", ["geschichte", "antike"]),
    ];
    all[3].categories = ["Geschichte"];
    const related = computeRelatedBooks(target, all);
    expect(related).toContain("b");
    expect(related).toContain("d");
    expect(related).not.toContain("c");
    expect(related.indexOf("b")).toBeLessThan(related.indexOf("d"));
  });

  it("ignores generische Titelwörter wie „book“", () => {
    const target = book("a", "The Tyranny of Debt — Book 1", "Autor X", []);
    const related = computeRelatedBooks(target, [
      target,
      book("b", "The Book", "Autor Y", []),
      book("c", "Another Book", "Autor Z", []),
    ]);
    expect(related).toEqual([]);
  });

  it("ignoriert seltene Titelwörter und Tags ohne starkes Signal", () => {
    const target = book("a", "Nikola Tesla Engineering Notes", "Autor X", []);
    const related = computeRelatedBooks(target, [
      target,
      book("b", "Nikola Tesla: A Life From Beginning to End", "Autor Y", []),
      book("c", "Cooking Basics", "Autor Z", []),
    ]);
    expect(related).toEqual([]);
  });

  it("verwendet unbekannte Autoren nicht als gemeinsames Signal", () => {
    const target = book("a", "Buch A", "Unbekannt", []);
    const related = computeRelatedBooks(target, [
      target,
      book("b", "Buch B", "Unbekannt", []),
    ]);
    expect(related).toEqual([]);
  });

  it("extrahiert Tags aus Ordnerpfaden", () => {
    expect(extractTagsFromPath("02 Sachbuch/Geschichte", "!BookLibrary")).toEqual([
      "02-sachbuch",
      "geschichte",
    ]);
  });
});
