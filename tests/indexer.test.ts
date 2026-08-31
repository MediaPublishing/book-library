import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import JSZip from "jszip";
import { LibraryIndexer, normalizeBookRecord } from "../src/indexer";
import { MetadataProvider } from "../src/metadata";
import { sha256 } from "../src/util";

async function makeEpub(title: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    `<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
  );
  zip.file(
    "OEBPS/content.opf",
    `<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>${title}</dc:title><dc:creator>Test Autor</dc:creator><dc:language>de</dc:language></metadata><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>`
  );
  zip.file("OEBPS/c.xhtml", "<html><body><p>Inhalt</p></body></html>");
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

function mockProvider(): MetadataProvider {
  return new MetadataProvider(async () => ({ status: 404, text: "" }));
}

function mockProviderWithCover(): MetadataProvider {
  return new MetadataProvider(async (url: string) => {
    if (url.includes("covers.openlibrary.org")) {
      return {
        status: 200,
        text: "",
        arrayBuffer: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9, 9]).buffer,
      };
    }
    if (url.includes("openlibrary.org/search.json")) {
      return {
        status: 200,
        text: JSON.stringify({
          docs: [
            {
              title: "Buch A",
              author_name: ["Test Autor"],
              cover_i: 42,
            },
          ],
        }),
      };
    }
    return { status: 404, text: "" };
  });
}

describe("library indexer", () => {
  it("verwirft beschädigte externe Provenienzfelder beim Laden", () => {
    const normalized = normalizeBookRecord({
      hash: "x", file: "x.epub", format: "epub", size: 1, mtime: 1, cover: "", ingested: "",
      title: "X", author: "Y", year: "", language: "en", publisher: "", isbn: "", pages: "",
      tags: [], source: "local", summary: "", related: [], wikiStatus: "none", markdownPath: "",
      sourceRatings: [
        { source: "google-books", url: "javascript:bad", locale: "en", checkedAt: "", matchConfidence: 2, value: 8, count: -1, status: "provider-reported" },
      ],
      sourceDescriptions: [
        { source: "google-books", url: "https://books.google.com/x", locale: "en", checkedAt: "", matchConfidence: 1, text: "  Valid text  ", kind: "source" },
      ],
    });
    expect(normalized.sourceRatings).toEqual([]);
    expect(normalized.sourceDescriptions?.[0].text).toBe("Valid text");
  });

  it("baut Katalogdateien mit Frontmatter und Cache", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-test-"));
    const library = path.join(root, "Buecher");
    const catalog = path.join(root, "vault", "_catalog");
    const covers = path.join(root, "vault", "_catalog", "covers");
    fs.mkdirSync(path.join(library, "Geschichte"), { recursive: true });
    fs.mkdirSync(covers, { recursive: true });
    fs.writeFileSync(path.join(library, "Geschichte", "Buch A.epub"), await makeEpub("Buch A"));
    fs.writeFileSync(path.join(library, "Geschichte", "Buch B.epub"), await makeEpub("Buch B"));

    const indexer = new LibraryIndexer(mockProvider());
    const result = await indexer.scan({
      libraryPath: library,
      catalogDir: catalog,
      coversDir: covers,
      wikiDir: "_wiki",
      includeExtensions: ["epub", "pdf"],
      tagsFromFolders: true,
      fetchMetadata: false,
      maxFiles: 100,
      language: "de",
    });
    expect(result.added).toBe(2);
    expect(fs.existsSync(path.join(catalog, ".book-library-cache.json"))).toBe(true);
    expect(fs.existsSync(path.join(catalog, ".book-library-index.json"))).toBe(true);
    const bookIndex = JSON.parse(fs.readFileSync(path.join(catalog, ".book-library-index.json"), "utf8")) as {
      entries: Record<string, { format?: string }>;
    };
    expect(Object.values(bookIndex.entries).length).toBe(2);
    expect(Object.values(bookIndex.entries)[0].format).toBe("epub");
    const files = fs.readdirSync(catalog).filter((f) => f.endsWith(".md"));
    expect(files.length).toBe(2);
    expect(files).toContain("Buch A — Test Autor.md");
    expect(files.every((file) => !/^[a-f0-9]{64}\.md$/i.test(file))).toBe(true);
    const contents = files.map((f) => fs.readFileSync(path.join(catalog, f), "utf8")).join("\n");
    expect(contents).toContain("title: \"Buch A\"");
    expect(contents).toContain("title: \"Buch B\"");
    expect(contents).toContain("tags: [\"geschichte\"]");

    const cache = JSON.parse(fs.readFileSync(path.join(catalog, ".book-library-cache.json"), "utf8"));
    expect(Object.keys(cache.entries).length).toBe(2);
  });

  it("vermeidet Re-Scan unveränderter Dateien über den Cache", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-test-"));
    const library = path.join(root, "Buecher");
    const catalog = path.join(root, "vault", "_catalog");
    const covers = path.join(root, "vault", "_catalog", "covers");
    fs.mkdirSync(library, { recursive: true });
    fs.mkdirSync(covers, { recursive: true });
    fs.writeFileSync(path.join(library, "Buch A.epub"), await makeEpub("Buch A"));

    const indexer = new LibraryIndexer(mockProvider());
    const first = await indexer.scan({
      libraryPath: library,
      catalogDir: catalog,
      coversDir: covers,
      wikiDir: "_wiki",
      includeExtensions: ["epub", "pdf"],
      tagsFromFolders: false,
      fetchMetadata: false,
      maxFiles: 100,
      language: "en",
    });
    expect(first.added).toBe(1);

    const second = await indexer.scan({
      libraryPath: library,
      catalogDir: catalog,
      coversDir: covers,
      wikiDir: "_wiki",
      includeExtensions: ["epub", "pdf"],
      tagsFromFolders: false,
      fetchMetadata: false,
      maxFiles: 100,
      language: "en",
    });
    expect(second.added + second.updated).toBe(0);
  });

  it("lädt Covers aus der Metadaten-API in den Cover-Ordner", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-test-"));
    const library = path.join(root, "Buecher");
    const catalog = path.join(root, "vault", "_catalog");
    const covers = path.join(root, "vault", "_catalog", "covers");
    fs.mkdirSync(library, { recursive: true });
    fs.mkdirSync(covers, { recursive: true });
    fs.writeFileSync(path.join(library, "Buch A.epub"), await makeEpub("Buch A"));

    const indexer = new LibraryIndexer(mockProviderWithCover());
    const result = await indexer.scan({
      libraryPath: library,
      catalogDir: catalog,
      coversDir: covers,
      wikiDir: "_wiki",
      includeExtensions: ["epub", "pdf"],
      tagsFromFolders: false,
      fetchMetadata: true,
      maxFiles: 100,
      language: "en",
    });
    expect(result.added).toBe(1);
    const coverFiles = fs.readdirSync(covers).filter((f) => f !== ".DS_Store");
    expect(coverFiles.length).toBe(1);
    const record = Object.values(result.index.entries)[0];
    expect(record.cover).toBe(coverFiles[0]);
  });

  it("leitet das Jahr aus dem Ordnernamen ab", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-test-"));
    const library = path.join(root, "Buecher");
    const catalog = path.join(root, "vault", "_catalog");
    const covers = path.join(root, "vault", "_catalog", "covers");
    fs.mkdirSync(path.join(library, "Geschichte (1966)"), { recursive: true });
    fs.mkdirSync(covers, { recursive: true });
    fs.writeFileSync(path.join(library, "Geschichte (1966)", "Buch A.epub"), await makeEpub("Buch A"));

    const indexer = new LibraryIndexer(mockProvider());
    const result = await indexer.scan({
      libraryPath: library,
      catalogDir: catalog,
      coversDir: covers,
      wikiDir: "_wiki",
      includeExtensions: ["epub", "pdf"],
      tagsFromFolders: false,
      fetchMetadata: false,
      maxFiles: 100,
      language: "de",
    });
    const record = Object.values(result.index.entries)[0];
    expect(record.year).toBe("1966");
  });

  it("stops at maxFiles before metadata requests", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-limit-"));
    const library = path.join(root, "Buecher");
    const catalog = path.join(root, "vault", "_catalog");
    fs.mkdirSync(catalog, { recursive: true });
    fs.mkdirSync(library, { recursive: true });
    for (const name of ["Buch A", "Buch B", "Buch C"]) {
      fs.writeFileSync(path.join(library, `${name}.epub`), await makeEpub(name));
    }
    let metadataCalls = 0;
    const provider = new MetadataProvider(async () => {
      metadataCalls += 1;
      return { status: 404, text: "" };
    });
    const result = await new LibraryIndexer(provider).scan({
      libraryPath: library,
      catalogDir: catalog,
      coversDir: path.join(catalog, "covers"),
      wikiDir: "_wiki",
      includeExtensions: ["epub"],
      tagsFromFolders: false,
      fetchMetadata: true,
      maxFiles: 2,
      language: "en",
    });
    expect(Object.keys(result.index.entries)).toHaveLength(2);
    expect(metadataCalls).toBeLessThanOrEqual(4);
  });

  it("begrenzt externe Metadaten-Lookups unabhängig von der Bibliotheksgrösse", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-metadata-budget-"));
    const library = path.join(root, "Buecher");
    const catalog = path.join(root, "vault", "_catalog");
    fs.mkdirSync(catalog, { recursive: true });
    fs.mkdirSync(library, { recursive: true });
    for (const name of ["Buch A", "Buch B", "Buch C"]) {
      fs.writeFileSync(path.join(library, `${name}.epub`), await makeEpub(name));
    }
    let metadataCalls = 0;
    const provider = new MetadataProvider(async () => {
      metadataCalls += 1;
      return { status: 404, text: "" };
    });

    const result = await new LibraryIndexer(provider).scan({
      libraryPath: library,
      catalogDir: catalog,
      coversDir: path.join(catalog, "covers"),
      wikiDir: "_wiki",
      includeExtensions: ["epub"],
      tagsFromFolders: false,
      fetchMetadata: true,
      maxMetadataLookups: 1,
      maxFiles: 100,
      language: "en",
    });

    expect(Object.keys(result.index.entries)).toHaveLength(3);
    expect(metadataCalls).toBe(2);
    expect(Object.values(result.index.entries).filter((book) => book.enrichmentState === "failed")).toHaveLength(1);
  });

  it("bewahrt vertrauenswürdige Anreicherung nach Cache-Verlust und Offline-Rescan", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-preserve-enrichment-"));
    const library = path.join(root, "Buecher");
    const catalog = path.join(root, "vault", "_catalog");
    const covers = path.join(catalog, "covers");
    fs.mkdirSync(library, { recursive: true });
    fs.mkdirSync(covers, { recursive: true });
    fs.writeFileSync(path.join(library, "Buch A.epub"), await makeEpub("Buch A"));
    const indexer = new LibraryIndexer(mockProvider());
    const options = {
      libraryPath: library,
      catalogDir: catalog,
      coversDir: covers,
      wikiDir: "_wiki",
      includeExtensions: ["epub"],
      tagsFromFolders: false,
      fetchMetadata: false,
      maxFiles: 100,
      language: "de" as const,
    };
    const first = await indexer.scan(options);
    const book = Object.values(first.index.entries)[0];
    book.description = "Vertrauenswürdige Beschreibung";
    book.summary = "Vertrauenswürdige Beschreibung";
    book.sourceDescriptions = [{
      source: "google-books",
      url: "https://books.google.com/books?id=trusted",
      locale: "de",
      checkedAt: "2026-08-30T00:00:00Z",
      matchConfidence: 1,
      text: "Vertrauenswürdige Beschreibung",
      kind: "source",
    }];
    fs.writeFileSync(path.join(catalog, ".book-library-index.json"), JSON.stringify(first.index, null, 2), "utf8");
    fs.unlinkSync(path.join(catalog, ".book-library-cache.json"));

    const second = await indexer.scan(options);
    const rescanned = Object.values(second.index.entries)[0];
    expect(rescanned.description).toBe("Vertrauenswürdige Beschreibung");
    expect(rescanned.sourceDescriptions).toHaveLength(1);
  });

  it("archiviert Legacy-Hash-Notizen nur bei nachgewiesenem Book-Library-Eigentum", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-owned-legacy-"));
    const library = path.join(root, "Buecher");
    const catalog = path.join(root, "vault", "_catalog");
    const covers = path.join(catalog, "covers");
    fs.mkdirSync(library, { recursive: true });
    fs.mkdirSync(covers, { recursive: true });
    const epub = await makeEpub("Buch A");
    fs.writeFileSync(path.join(library, "Buch A.epub"), epub);
    const hashNote = path.join(catalog, `${sha256(epub)}.md`);
    fs.writeFileSync(hashNote, "# Meine private Hash-Notiz\n", "utf8");
    const options = {
      libraryPath: library,
      catalogDir: catalog,
      coversDir: covers,
      wikiDir: "_wiki",
      includeExtensions: ["epub"],
      tagsFromFolders: false,
      fetchMetadata: false,
      maxFiles: 100,
      language: "de" as const,
    };
    const indexer = new LibraryIndexer(mockProvider());

    await indexer.scan(options);
    expect(fs.readFileSync(hashNote, "utf8")).toBe("# Meine private Hash-Notiz\n");

    fs.writeFileSync(hashNote, [
      "---",
      "kind: book",
      "cssclasses: [book-library-catalog-note]",
      "---",
      "# Alter Book-Library-Katalog",
      "",
    ].join("\n"), "utf8");
    await indexer.scan(options);
    expect(fs.existsSync(hashNote)).toBe(false);
    expect(fs.existsSync(path.join(catalog, ".book-library-legacy-hash-notes", path.basename(hashNote)))).toBe(true);
  });
});
