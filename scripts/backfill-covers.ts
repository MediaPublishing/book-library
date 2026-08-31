import * as fs from "fs";
import * as path from "path";
import { backfillMissingCovers } from "../src/cover-backfill";
import { catalogFileName, renderCatalogRecord } from "../src/catalog";
import { MetadataProvider } from "../src/metadata";
import type { BookIndex } from "../src/types";

const ROOT = process.cwd();
const INDEX_PATH = path.join(ROOT, "fixtures", "vault", "_catalog", ".book-library-index.json");
const CATALOG_DIR = path.join(ROOT, "fixtures", "vault", "_catalog");
const COVERS_DIR = path.join(CATALOG_DIR, "covers");
const WIKI_DIR = "_wiki";
const LANGUAGE = "de";

function limitArg(): number {
  const index = process.argv.indexOf("--limit");
  if (index < 0) return 0;
  return Math.max(0, Number(process.argv[index + 1]) || 0);
}

function hasPlausibleIsbn(value: string): boolean {
  const digits = value.replace(/[^0-9Xx]/g, "");
  if (digits.length === 13 && /^(978|979)/.test(digits) && new Set(digits).size > 1) {
    const total = [...digits].reduce((sum, digit, index) => {
      const weight = index % 2 === 0 ? 1 : 3;
      return sum + Number(digit) * weight;
    }, 0);
    return total % 10 === 0;
  }
  if (digits.length === 10 && new Set(digits.slice(0, 9)).size > 1) {
    const total = [...digits].reduce((sum, digit, index) => {
      const valueAt = digit === "X" || digit === "x" ? 10 : Number(digit);
      return sum + valueAt * (10 - index);
    }, 0);
    return total % 11 === 0;
  }
  return false;
}

async function main(): Promise<void> {
  if (!fs.existsSync(INDEX_PATH)) {
    console.error("Index fehlt:", INDEX_PATH);
    process.exit(1);
  }
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as BookIndex;
  const books = Object.values(index.entries);
  const titles: Record<string, string> = {};
  const catalogPaths: Record<string, string> = {};
  for (const book of books) {
    titles[book.hash] = book.title;
    catalogPaths[book.hash] = catalogFileName(book);
  }
  const missing = books.filter((book) => !book.cover);
  console.log(`Bücher gesamt: ${books.length}, fehlende Covers: ${missing.length}`);
  const limit = limitArg();
  const skipIsbnFilter = process.argv.includes("--no-isbn-filter");
  const plausible = skipIsbnFilter
    ? missing
    : missing.filter((book) => hasPlausibleIsbn(book.isbn || ""));
  if (!skipIsbnFilter) {
    console.log(`ISBN-Filter aktiv: ${plausible.length} von ${missing.length} fehlenden Büchern mit plausibler ISBN.`);
  }
  const candidates = limit > 0 ? plausible.slice(0, limit) : plausible;
  if (limit > 0) {
    console.log(`Begrenzt auf ${candidates.length} Bücher (--limit ${limit}).`);
  }
  if (missing.length === 0) {
    console.log("Keine fehlenden Covers. Beende.");
    return;
  }
  const initialMissingCount = candidates.length;
  const provider = new MetadataProvider(async (url) => {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const text = Buffer.from(arrayBuffer).toString("utf8");
    return { status: response.status, text, arrayBuffer };
  });
  const result = await backfillMissingCovers({
    books: candidates,
    provider,
    coversDir: COVERS_DIR,
    catalogDir: CATALOG_DIR,
    wikiDir: WIKI_DIR,
    language: LANGUAGE,
    titles,
    catalogPaths,
    concurrency: 6,
    onProgress: (done, total) => {
      if (done % 25 === 0 || done === total) {
        console.log(`Fortschritt: ${done}/${total}`);
      }
    },
  });
  console.log(
    `Backfill fertig: ${result.added} Covers ergänzt, ${result.skipped} ohne Cover, ${result.enriched} angereichert.`
  );
  console.log("");
  console.log("Einzelauswertung (geprüft, gefunden, fehlt):");
  for (const book of candidates) {
    console.log(
      `- ${book.cover ? "FOUND" : "MISS "} | ${book.title.slice(0, 70)}${book.author ? ` | ${book.author.slice(0, 40)}` : ""}${book.isbn ? ` | ISBN ${book.isbn}` : ""}`
    );
  }
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
  const refreshed = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as BookIndex;
  const refreshedBooks = Object.values(refreshed.entries);
  const refreshedTitles: Record<string, string> = {};
  const refreshedCatalogPaths: Record<string, string> = {};
  for (const book of refreshedBooks) {
    refreshedTitles[book.hash] = book.title;
    refreshedCatalogPaths[book.hash] = catalogFileName(book);
  }
  const affectedHashes = new Set(candidates.map((book) => book.hash));
  let rendered = 0;
  for (const book of refreshedBooks) {
    const absolute = path.join(CATALOG_DIR, catalogFileName(book));
    if (!fs.existsSync(absolute)) continue;
    if (limit > 0 && !affectedHashes.has(book.hash)) continue;
    fs.writeFileSync(
      absolute,
      renderCatalogRecord(book, {
        language: LANGUAGE,
        wikiDir: WIKI_DIR,
        titles: refreshedTitles,
        catalogPaths: refreshedCatalogPaths,
      }),
      "utf8"
    );
    rendered += 1;
  }
  console.log("");
  console.log(`Katalognotizen neu gerendert: ${rendered}.`);
  const finalMissing = refreshedBooks.filter((book) => !book.cover).length;
  const batchStillMissing = refreshedBooks.filter(
    (book) => affectedHashes.has(book.hash) && !book.cover
  ).length;
  console.log(
    `Batch-Auswertung: geprüft ${initialMissingCount}, gefunden ${initialMissingCount - batchStillMissing}, weiterhin ohne Cover ${batchStillMissing}. Gesamt ohne Cover: ${finalMissing}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
