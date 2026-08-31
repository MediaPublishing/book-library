import type { BookRecord } from "./types";

const NON_SIGNAL_VALUES = new Set(["-", "n/a", "na", "none", "unbekannt", "unknown"]);

function normalizedSignal(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized && !NON_SIGNAL_VALUES.has(normalized) ? normalized : "";
}

function sharedValues(bookValues: string[] | undefined, candidateValues: string[] | undefined): number {
  const candidate = new Set((candidateValues || []).map(normalizedSignal).filter(Boolean));
  let matches = 0;
  for (const value of bookValues || []) {
    const signal = normalizedSignal(value);
    if (signal && candidate.has(signal)) matches += 1;
  }
  return matches;
}

export function computeRelatedBooks(book: BookRecord, all: BookRecord[], limit = 6): string[] {
  if (limit <= 0) return [];
  const candidates = all.filter((candidate) => candidate.hash !== book.hash && candidate.hash);
  const bookCategories = book.categories || [];
  const bookThemes = book.themes || [];

  const scored = candidates.map((candidate) => {
    let score = 0;
    if (
      book.author &&
      candidate.author &&
      normalizedSignal(book.author) === normalizedSignal(candidate.author) &&
      Boolean(normalizedSignal(book.author))
    ) {
      score += 4;
    }

    score += sharedValues(bookCategories, candidate.categories) * 4;
    score += sharedValues(bookThemes, candidate.themes) * 4;

    return {
      hash: candidate.hash,
      score: Math.round(score * 100) / 100,
      title: candidate.title,
    };
  // Ein Treffer benötigt Autor-, Kategorie- oder Themenüberschneidung.
  // Titelwörter und Ordner-Tags sind dafür absichtlich kein Ersatz.
  }).filter((entry) => entry.score >= 4);

  scored.sort((a, b) =>
    b.score - a.score ||
    a.title.localeCompare(b.title, "en", { sensitivity: "base" }) ||
    a.hash.localeCompare(b.hash)
  );
  return scored.slice(0, limit).map((entry) => entry.hash);
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
