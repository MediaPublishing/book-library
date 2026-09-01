import type { BookRecord } from "./types";
import {
  getPreparedSemanticLinkEvidence,
  prepareSemanticRecord,
  type PreparedSemanticRecord,
} from "./semantic-search";

export interface RelatedBookMatch {
  hash: string;
  title: string;
  score: number;
  reasons: string[];
}

export interface RelatedBookSemanticIndex {
  books: ReadonlyMap<string, BookRecord>;
  prepared: ReadonlyMap<string, PreparedSemanticRecord<BookRecord>>;
  candidatesBySignal: ReadonlyMap<string, ReadonlySet<string>>;
}

const NON_SIGNAL_VALUES = new Set(["-", "n/a", "na", "none", "unbekannt", "unknown"]);

function normalizedSignal(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized && !NON_SIGNAL_VALUES.has(normalized) ? normalized : "";
}

function sharedLabels(bookValues: string[] | undefined, candidateValues: string[] | undefined): string[] {
  const candidates = new Map(
    (candidateValues || [])
      .map((value) => [normalizedSignal(value), value.trim()] as const)
      .filter(([signal]) => Boolean(signal))
  );
  return (bookValues || [])
    .map((value) => candidates.get(normalizedSignal(value)) || "")
    .filter(Boolean);
}

export function computeRelatedBooks(book: BookRecord, all: BookRecord[], limit = 6): string[] {
  return explainRelatedBooks(book, all, limit).map((entry) => entry.hash);
}

/** Prepare semantic fields once for a full related-books rebuild. */
export function buildRelatedBookSemanticIndex(all: readonly BookRecord[]): RelatedBookSemanticIndex {
  const books = new Map(all.filter((book) => book.hash).map((book) => [book.hash, book]));
  const prepared = new Map([...books].map(([hash, book]) => [hash, prepareSemanticRecord(book)]));
  const candidatesBySignal = new Map<string, Set<string>>();
  for (const [hash, record] of prepared) {
    for (const key of strongSignalKeys(record)) {
      const candidates = candidatesBySignal.get(key) || new Set<string>();
      candidates.add(hash);
      candidatesBySignal.set(key, candidates);
    }
  }
  return { books, prepared, candidatesBySignal };
}

/** Rebuild every related list while reusing the same prepared semantic index. */
export function computeRelatedBooksForLibrary(all: BookRecord[], limit = 6): Map<string, string[]> {
  const semanticIndex = buildRelatedBookSemanticIndex(all);
  return new Map(all.map((book) => [
    book.hash,
    explainRelatedBooks(book, all, limit, semanticIndex).map((entry) => entry.hash),
  ]));
}

/**
 * Returns the controlled candidate list used by both Related Books and Wiki links.
 * A candidate needs the same author, an exact category/theme, or a shared concept
 * token inside a category/theme. Descriptions and generic title words only rerank;
 * they can never create a link by themselves.
 */
export function explainRelatedBooks(
  book: BookRecord,
  all: BookRecord[],
  limit = 6,
  semanticIndex: RelatedBookSemanticIndex = buildRelatedBookSemanticIndex(all),
): RelatedBookMatch[] {
  if (limit <= 0) return [];
  const candidateHashes = new Set<string>();
  const preparedBook = semanticIndex.prepared.get(book.hash) || prepareSemanticRecord(book);
  for (const key of strongSignalKeys(preparedBook)) {
    for (const hash of semanticIndex.candidatesBySignal.get(key) || []) candidateHashes.add(hash);
  }
  const candidates = [...candidateHashes]
    .filter((hash) => hash !== book.hash)
    .map((hash) => semanticIndex.books.get(hash))
    .filter((candidate): candidate is BookRecord => Boolean(candidate));
  const bookCategories = book.categories || [];
  const bookThemes = book.themes || [];

  const scored = candidates.map((candidate) => {
    let score = 0;
    const reasons: string[] = [];
    if (
      book.author &&
      candidate.author &&
      normalizedSignal(book.author) === normalizedSignal(candidate.author) &&
      Boolean(normalizedSignal(book.author))
    ) {
      score += 6;
      reasons.push(`Gleicher Autor: ${book.author.trim()}`);
    }

    const categories = sharedLabels(bookCategories, candidate.categories);
    const themes = sharedLabels(bookThemes, candidate.themes);
    score += categories.length * 4;
    score += themes.length * 4;
    if (categories.length) reasons.push(`Gemeinsame Kategorien: ${categories.join(", ")}`);
    if (themes.length) reasons.push(`Gemeinsame Themen: ${themes.join(", ")}`);

    const semantic = getPreparedSemanticLinkEvidence(
      preparedBook,
      semanticIndex.prepared.get(candidate.hash) || prepareSemanticRecord(candidate),
    );
    const semanticConcepts = semantic.signals.filter((signal) => signal.strong && signal.field !== "author");
    if (score === 0 && semanticConcepts.length > 0) score = 4;
    if (score > 0) score += semantic.score * 2;
    for (const signal of semanticConcepts) {
      const label = signal.field === "themes" ? "Themen" : signal.field === "categories" ? "Kategorien" : "Konzepte";
      const reason = `Semantische ${label}: ${signal.matchedTerms.join(", ")}`;
      if (!reasons.includes(reason)) reasons.push(reason);
    }

    return {
      hash: candidate.hash,
      score: Math.round(score * 100) / 100,
      title: candidate.title,
      reasons,
    };
  }).filter((entry) => entry.score >= 4);

  scored.sort((a, b) =>
    b.score - a.score ||
    a.title.localeCompare(b.title, "en", { sensitivity: "base" }) ||
    a.hash.localeCompare(b.hash)
  );
  return scored.slice(0, limit);
}

function strongSignalKeys(record: PreparedSemanticRecord<BookRecord>): string[] {
  const keys = new Set<string>();
  const author = normalizedSignal(record.item.author);
  if (author) keys.add(`author:${author}`);
  for (const field of ["categories", "themes", "concepts"] as const) {
    for (const term of record.fields[field]) {
      keys.add(`${field}:${term.length >= 5 ? term.slice(0, 4) : term}`);
    }
  }
  return [...keys];
}

export function extractTagsFromPath(relativeDir: string, libraryRootName: string): string[] {
  const parts = relativeDir
    .split("/")
    .filter((part) => part.length > 0 && part !== "." && part !== libraryRootName);
  return parts.map((part) =>
    part
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  ).filter((tag) => tag.length > 0);
}
