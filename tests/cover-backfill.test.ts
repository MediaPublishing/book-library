import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { backfillMissingCovers } from "../src/cover-backfill";
import { MetadataProvider } from "../src/metadata";
import type { BookRecord } from "../src/types";

function mockProvider(): MetadataProvider {
  return new MetadataProvider(async (url: string) => {
    if (url.includes("openlibrary.org/api/books")) {
      return {
        status: 200,
        text: JSON.stringify({
          "ISBN:9783161484100": {
            title: "Testbuch",
            author_name: ["Autorin"],
            first_publish_year: 1966,
            cover_i: 1,
          },
        }),
      };
    }
    if (url.includes("covers.openlibrary.org")) {
      return {
        status: 200,
        text: "",
        arrayBuffer: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]).buffer,
      };
    }
    return { status: 404, text: "" };
  });
}

function makeBook(): BookRecord {
  return {
    hash: "abc123",
    file: "Buch A.epub",
    format: "epub",
    size: 100,
    mtime: 1,
    cover: "",
    ingested: "2026-08-13T00:00:00Z",
    title: "Buch A",
    author: "",
    year: "",
    language: "",
    publisher: "",
    isbn: "9783161484100",
    pages: "",
    tags: ["geschichte"],
    source: "local",
    summary: "",
    related: [],
    wikiStatus: "none",
    markdownPath: "",
  };
}

describe("cover backfill", () => {
  it("lädt Cover und reichert fehlende Metadaten an", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-covers-"));
    const catalog = path.join(root, "_catalog");
    const covers = path.join(catalog, "covers");
    fs.mkdirSync(covers, { recursive: true });
    const book = makeBook();
    fs.writeFileSync(path.join(catalog, "abc123.md"), "# Buch A\n");

    const result = await backfillMissingCovers({
      books: [book],
      provider: mockProvider(),
      coversDir: covers,
      catalogDir: catalog,
      wikiDir: "_wiki",
      language: "de",
      concurrency: 1,
    });

    expect(result.added).toBe(1);
    expect(book.cover).toBe("abc123.jpg");
    expect(fs.existsSync(path.join(covers, "abc123.jpg"))).toBe(true);
    const note = fs.readFileSync(path.join(catalog, "Buch A — Autorin.md"), "utf8");
    expect(note).toMatch(/\*\*Autor:\*\* \[\[_catalog\/authors\/local-autorin-[a-f0-9]{20}\|Autorin\]\]/);
    expect(note).toContain("**Jahr:** 1966");
  });
});
