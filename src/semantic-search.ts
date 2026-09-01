import type { AudiobookRecord, BookRecord } from "./types";

/** Records supported by the local search and linking engine. */
export type SemanticSearchRecord = BookRecord | AudiobookRecord;

export type SemanticField =
  | "title"
  | "author"
  | "themes"
  | "categories"
  | "tags"
  | "concepts"
  | "description"
  | "summary"
  | "synopsis";

export interface SemanticSignal {
  field: SemanticField;
  matchedTerms: string[];
  contribution: number;
  /** True when this field is a strong, intentional linking signal. */
  strong: boolean;
  exact: boolean;
}

export interface SemanticSearchResult<T extends SemanticSearchRecord> {
  item: T;
  score: number;
  reasons: string[];
  signals: SemanticSignal[];
}

export interface SemanticSearchOptions {
  /** Return at most this many results. The default keeps every input record. */
  limit?: number;
  /** Exclude results below this score. Defaults to 0 (unrelated records remain visible at the end). */
  minScore?: number;
}

export interface SemanticSimilarityResult {
  score: number;
  reasons: string[];
  signals: SemanticSignal[];
}

export interface SemanticLinkEvidence extends SemanticSimilarityResult {
  hasStrongSignal: boolean;
}

export type SemanticFieldValues = Record<SemanticField, string[]>;

/** Tokenized metadata that can be reused across searches and pairwise comparisons. */
export interface PreparedSemanticRecord<T extends SemanticSearchRecord = SemanticSearchRecord> {
  item: T;
  fields: SemanticFieldValues;
}

/**
 * Search local book metadata without a network call or an embedding model.
 * This is weighted lexical/prefix matching across semantic metadata fields,
 * not dense vector similarity. Signals stay exposed so callers can explain
 * why a book was ranked or linked.
 */
export function rankSemanticSearch<T extends SemanticSearchRecord>(
  query: string,
  records: readonly T[],
  options: SemanticSearchOptions = {},
): SemanticSearchResult<T>[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return rankLiteralFallback(query, records, options);

  return rankPreparedSemanticSearch(queryTerms, records.map(prepareSemanticRecord), options);
}

/** Rank records whose metadata was tokenized once for repeated searches. */
export function rankPreparedSemanticSearch<T extends SemanticSearchRecord>(
  query: string | readonly string[],
  records: readonly PreparedSemanticRecord<T>[],
  options: SemanticSearchOptions = {},
): SemanticSearchResult<T>[] {
  const queryTerms = typeof query === "string" ? tokenize(query) : [...query];
  if (queryTerms.length === 0) {
    return typeof query === "string"
      ? rankLiteralFallback(query, records.map(({ item }) => item), options)
      : [];
  }

  const minScore = Math.max(0, options.minScore ?? 0);
  const results = records.map(({ item, fields }, index) => {
    const scored = scoreAgainstTerms(queryTerms, fields);
    return { item, index, ...scored };
  }).filter((result) => result.score >= minScore);

  results.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  const limit = options.limit === undefined ? results.length : Math.max(0, options.limit);
  return results.slice(0, limit).map(({ item, score, reasons, signals }) => ({ item, score, reasons, signals }));
}

export function prepareSemanticRecord<T extends SemanticSearchRecord>(item: T): PreparedSemanticRecord<T> {
  return { item, fields: extractFields(item) };
}

/** Calculate deterministic weighted semantic similarity between two records. */
export function calculateSemanticSimilarity(
  left: SemanticSearchRecord,
  right: SemanticSearchRecord,
): SemanticSimilarityResult {
  return calculatePreparedSemanticSimilarity(prepareSemanticRecord(left), prepareSemanticRecord(right));
}

/** Compare records that were prepared once by a library-wide linking pass. */
export function calculatePreparedSemanticSimilarity(
  left: PreparedSemanticRecord,
  right: PreparedSemanticRecord,
): SemanticSimilarityResult {
  const leftFields = left.fields;
  const rightFields = right.fields;
  const signals: SemanticSignal[] = [];
  let weightedShared = 0;
  let weightedPossible = 0;

  for (const field of SEARCH_FIELDS) {
    const leftTerms = [...new Set(leftFields[field])];
    const rightTerms = [...new Set(rightFields[field])];
    const matches = matchTerms(leftTerms, rightTerms);
    const sharedTerms = matches.map(formatTermMatch);
    const unionSize = new Set([...leftTerms, ...rightTerms]).size;
    if (unionSize === 0) continue;
    const weight = FIELD_WEIGHTS[field];
    const overlap = matches.reduce((sum, match) => sum + match.similarity, 0) / unionSize;
    weightedShared += overlap * weight;
    weightedPossible += weight;
    if (sharedTerms.length > 0) {
      const exact = matches.length === leftTerms.length
        && matches.length === rightTerms.length
        && matches.every((match) => match.similarity === 1);
      signals.push({
        field,
        matchedTerms: sharedTerms,
        contribution: round(overlap * weight),
        strong: STRONG_FIELDS.has(field),
        exact,
      });
    }
  }

  const score = weightedPossible === 0 ? 0 : round(weightedShared / weightedPossible);
  return { score, signals, reasons: buildReasons(signals) };
}

/** Pairwise evidence intended for related-book/topic links. */
export function getSemanticLinkEvidence(
  left: SemanticSearchRecord,
  right: SemanticSearchRecord,
): SemanticLinkEvidence {
  const similarity = calculateSemanticSimilarity(left, right);
  return { ...similarity, hasStrongSignal: similarity.signals.some((signal) => signal.strong) };
}

export function getPreparedSemanticLinkEvidence(
  left: PreparedSemanticRecord,
  right: PreparedSemanticRecord,
): SemanticLinkEvidence {
  const similarity = calculatePreparedSemanticSimilarity(left, right);
  return { ...similarity, hasStrongSignal: similarity.signals.some((signal) => signal.strong) };
}

// Kept as a descriptive alias for callers that prefer the verb form.
export const buildSemanticLinkEvidence = getSemanticLinkEvidence;

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE")
    .replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const SEARCH_FIELDS: readonly SemanticField[] = [
  "title", "author", "themes", "categories", "tags", "concepts", "description", "summary", "synopsis",
];

const FIELD_WEIGHTS: Record<SemanticField, number> = {
  title: 8,
  author: 7,
  themes: 4,
  categories: 4,
  tags: 3,
  concepts: 4,
  description: 2,
  summary: 2,
  synopsis: 2,
};

const STRONG_FIELDS = new Set<SemanticField>(["author", "themes", "categories", "concepts"]);

// Common German and English function words add no useful concept signal.
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "auf", "aus", "bei", "das", "dass", "dem", "den", "der", "des", "die", "ein", "eine", "einer", "eines", "für", "in", "ist", "mit", "of", "on", "or", "the", "to", "und", "von", "zu",
]);

function tokenize(value: string): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

function extractFields(record: SemanticSearchRecord): SemanticFieldValues {
  const isBook = "hash" in record;
  return {
    title: tokenize(record.title),
    author: tokenize(record.author),
    themes: tokenize(readArray(isBook ? record.themes : undefined)),
    categories: tokenize(readArray(isBook ? record.categories : record.category)),
    tags: tokenize(readArray(isBook ? record.tags : undefined)),
    concepts: [],
    description: tokenize(record.description || ""),
    summary: tokenize(isBook ? record.summary : ""),
    synopsis: tokenize(isBook ? "" : record.synopsis),
  };
}

function scoreAgainstTerms(queryTerms: string[], fields: SemanticFieldValues): Pick<SemanticSearchResult<SemanticSearchRecord>, "score" | "reasons" | "signals"> {
  const queryVector = new Map<string, number>();
  for (const term of queryTerms) queryVector.set(term, (queryVector.get(term) ?? 0) + 1);

  let dot = 0;
  let documentNorm = 0;
  let queryNorm = 0;
  const signals: SemanticSignal[] = [];
  for (const term of queryVector.values()) queryNorm += term * term;

  for (const field of SEARCH_FIELDS) {
    const counts = countTerms(fields[field]);
    const weight = FIELD_WEIGHTS[field];
    for (const [term, count] of counts) {
      const value = weight * (1 + Math.log(count));
      documentNorm += value * value;
    }
    const matches = matchTerms([...queryVector.keys()], [...counts.keys()]);
    for (const match of matches) {
      const count = counts.get(match.right) ?? 1;
      const documentValue = weight * (1 + Math.log(count));
      dot += documentValue * (queryVector.get(match.left) ?? 1) * match.similarity;
    }
    const matchedTerms = matches.map(formatTermMatch);
    if (matches.length > 0) {
      const exact = field === "title" && normalizeSearchText(readFieldText(fields[field])) === normalizeSearchText(queryTerms.join(" "));
      const contribution = matches.reduce((sum, match) =>
        sum + weight * (1 + Math.log(counts.get(match.right) ?? 1)) * match.similarity, 0);
      signals.push({ field, matchedTerms, contribution: round(contribution), strong: STRONG_FIELDS.has(field), exact });
    }
  }

  if (dot === 0 || documentNorm === 0 || queryNorm === 0) return { score: 0, signals: [], reasons: [] };
  const cosine = dot / Math.sqrt(documentNorm * queryNorm);
  const titleText = readFieldText(fields.title);
  const authorText = readFieldText(fields.author);
  const queryText = normalizeSearchText(queryTerms.join(" "));
  let exactBoost = 0;
  if (titleText && normalizeSearchText(titleText) === queryText) exactBoost += 0.35;
  else if (titleText && normalizeSearchText(titleText).includes(queryText)) exactBoost += 0.16;
  if (authorText && normalizeSearchText(authorText) === queryText) exactBoost += 0.12;
  const score = round(Math.min(1, cosine * 0.75 + exactBoost));
  return { score, signals, reasons: buildReasons(signals) };
}

function rankLiteralFallback<T extends SemanticSearchRecord>(
  query: string,
  records: readonly T[],
  options: SemanticSearchOptions,
): SemanticSearchResult<T>[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const minScore = Math.max(0, options.minScore ?? 0);
  const results = records.flatMap((item, index) => {
    const fields: Array<{ field: "title" | "author"; value: string; weight: number }> = [
      { field: "title", value: item.title, weight: 1 },
      { field: "author", value: item.author, weight: 0.7 },
    ];
    const match = fields.find(({ value }) => containsNormalizedPhrase(value, normalizedQuery));
    if (!match || match.weight < minScore) return [];
    const signal: SemanticSignal = {
      field: match.field,
      matchedTerms: [normalizedQuery],
      contribution: match.weight,
      strong: match.field === "author",
      exact: normalizeSearchText(match.value) === normalizedQuery,
    };
    return [{ item, index, score: match.weight, signals: [signal], reasons: buildReasons([signal]) }];
  });
  results.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  const limit = options.limit === undefined ? results.length : Math.max(0, options.limit);
  return results.slice(0, limit).map(({ item, score, reasons, signals }) => ({ item, score, reasons, signals }));
}

function containsNormalizedPhrase(value: string, normalizedQuery: string): boolean {
  const normalizedValue = normalizeSearchText(value);
  return ` ${normalizedValue} `.includes(` ${normalizedQuery} `);
}

function countTerms(terms: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
  return counts;
}

interface TermMatch {
  left: string;
  right: string;
  similarity: number;
}

function matchTerms(leftTerms: string[], rightTerms: string[]): TermMatch[] {
  const available = new Set(rightTerms);
  const matches: TermMatch[] = [];
  for (const left of leftTerms) {
    let best: TermMatch | null = null;
    for (const right of available) {
      const similarity = termSimilarity(left, right);
      if (similarity < 0.78 || (best && similarity <= best.similarity)) continue;
      best = { left, right, similarity };
    }
    if (!best) continue;
    matches.push(best);
    available.delete(best.right);
  }
  return matches;
}

function termSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length < 5 || right.length < 5) return 0;
  let prefix = 0;
  const max = Math.min(left.length, right.length);
  while (prefix < max && left[prefix] === right[prefix]) prefix += 1;
  return round(prefix / max);
}

function formatTermMatch(match: TermMatch): string {
  return match.similarity === 1 ? match.left : `${match.left}~${match.right}`;
}

function buildReasons(signals: SemanticSignal[]): string[] {
  return signals.map((signal) => {
    const label = FIELD_LABELS[signal.field];
    const terms = signal.matchedTerms.join(", ");
    return `${label}: ${signal.exact ? "exakte Übereinstimmung" : `gemeinsame Begriffe (${terms})`}`;
  });
}

const FIELD_LABELS: Record<SemanticField, string> = {
  title: "Titel",
  author: "Autor",
  themes: "Themen",
  categories: "Kategorien",
  tags: "Tags",
  concepts: "Konzepte",
  description: "Beschreibung",
  summary: "Zusammenfassung",
  synopsis: "Synopsis",
};

function readArray(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.filter((item): item is string => typeof item === "string").join(" ");
}

function readFieldText(tokens: string[]): string {
  return tokens.join(" ");
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
