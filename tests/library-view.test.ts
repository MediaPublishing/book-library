import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(__dirname, "../src/library-view.ts"), "utf8");

describe("library view accessibility and filter states", () => {
  it("uses the local semantic ranker for books and audiobooks", () => {
    expect(source).toMatch(/prepareAudiobookLibraryResults, prepareBookLibraryResults/);
    expect(source).toMatch(/prepareBookLibraryResults\(books/);
    expect(source).toMatch(/prepareAudiobookLibraryResults\(audiobooks/);
  });

  it("uses semantic card containers with sibling open and details actions", () => {
    expect(source).toMatch(/createEl\("article", \{ cls: "book-library-card" \}\)/);
    expect(source).toMatch(/book-library-card-actions/);
    expect(source).toMatch(/book-library-card-open/);
    expect(source).not.toMatch(/card\.setAttribute\("role", "button"\)/);
    expect(source).not.toMatch(/card\.setAttribute\("tabindex", "0"\)/);
  });

  it("only renders file-format filters for the books mode", () => {
    expect(source).toMatch(/if \(this\.libraryMode === "books"\) \{\s*const formatGroup/s);
    expect(source).toMatch(/data-format/);
  });

  it("uses the book-card hierarchy and match resolver for audiobooks", () => {
    expect(source).toMatch(/badges\.createSpan\(\{ text: this\.plugin\.t\("view\.badgeAudiobook"\)/);
    expect(source).toMatch(/getBookByHash: \(hash\) => this\.plugin\.getBookByHash\(hash\)/);
    expect(source).toMatch(/`\$\{audioFormat\} \$\{formatBytes\(audiobook\.audioBytes\)\}\$\{categories\}`/);
  });

  it("restores focus after rerendering filters and distinguishes filtered empty", () => {
    expect(source).toMatch(/private rememberFocus\(/);
    expect(source).toMatch(/private restoreFocus\(/);
    expect(source).toMatch(/data-empty-state.*filtered/s);
    expect(source).toMatch(/this\.plugin\.t\("view\.stats", \{ count: 0, total: allBooks\.length \}\)/);
  });
});
