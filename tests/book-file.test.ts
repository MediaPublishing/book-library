import { describe, expect, it } from "vitest";
import { resolveBookFilePath, resolveBookFolderPath, resolveContainedPath } from "../src/book-file";

describe("book file resolver", () => {
  it("resolves a nested EPUB path inside the configured library", () => {
    expect(resolveBookFilePath("/Books", "Author/Title/Book.epub")).toBe("/Books/Author/Title/Book.epub");
  });

  it("resolves a PDF path inside the configured library", () => {
    expect(resolveBookFilePath("/Books", "Folder/Book.pdf")).toBe("/Books/Folder/Book.pdf");
  });

  it("refuses a path that escapes the configured library", () => {
    expect(resolveBookFilePath("/Books", "../private/other.pdf")).toBeNull();
  });

  it("resolves only the containing folder of a valid catalog file", () => {
    expect(resolveBookFolderPath("/Books", "Author/Title/Book.epub")).toBe("/Books/Author/Title");
    expect(resolveBookFolderPath("/Books", "../private/other.pdf")).toBeNull();
  });

  it("contains index-controlled markdown paths inside their output root", () => {
    expect(resolveContainedPath("/Vault/_books", "folder/book.md")).toBe("/Vault/_books/folder/book.md");
    expect(resolveContainedPath("/Vault/_books", "../../secret.md")).toBeNull();
  });
});
