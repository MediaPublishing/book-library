import * as fs from "fs";
import * as path from "path";
import { rasterImageExtension } from "./metadata";
import { mergeByKey, sha256, normalizeDisplayText, normalizeMatchKey, uniqueNormalizedStrings } from "./util";
import type {
  AudiobookRecord,
  BookExternalIdentity,
  BookReview,
  BookSourceDescription,
  BookSourceRating,
  EnrichmentState,
} from "./types";

export interface AudiobookFetchedMetadata {
  title?: string;
  author?: string;
  description?: string;
  rating?: number;
  ratingsCount?: number;
  reviews?: BookReview[];
  sourceRatings?: BookSourceRating[];
  sourceDescriptions?: BookSourceDescription[];
  externalIdentities?: BookExternalIdentity[];
  publicMetadataSources?: string[];
  source?: string;
  enrichmentSource?: string;
  enrichmentState?: EnrichmentState;
  coverUrl?: string;
}

export type AudiobookCoverPayload = Uint8Array | ArrayBuffer | Buffer | null | undefined;

/**
 * Kleiner Provider-Vertrag für öffentliche Audiobook-Quellen. Provider dürfen
 * nur Daten liefern; die Dateiablage und deren Dateiname bleiben lokal unter
 * Kontrolle der Bibliothek.
 */
export interface AudiobookEnrichmentProvider {
  fetchByTitleAuthor(title: string, author: string, language?: string): Promise<AudiobookFetchedMetadata | null | undefined>;
  downloadCover?(metadata: AudiobookFetchedMetadata): Promise<AudiobookCoverPayload> | AudiobookCoverPayload;
}

export interface AudiobookEnrichmentOptions {
  /** Harte Obergrenze pro Lauf, damit kein unbounded Provider-Zugriff entsteht. */
  maxRecords?: number;
  /** Kleine Parallelität für unabhängige öffentliche Metadatenabfragen. */
  concurrency?: number;
  /** Ziel für Cover-Dateien; ohne Ziel werden Metadaten dennoch importiert. */
  coversDir?: string;
}

/** Enrich a single usable audiobook record without inventing reviews or metadata. */
export async function enrichAudiobookRecord(
  record: AudiobookRecord,
  provider: AudiobookEnrichmentProvider,
  options: AudiobookEnrichmentOptions = {},
): Promise<AudiobookRecord> {
  if (!hasUsableTitleAuthor(record)) return record;
  let fetched: AudiobookFetchedMetadata | null | undefined;
  try {
    fetched = await provider.fetchByTitleAuthor(record.title.trim(), record.author.trim(), record.language);
  } catch {
    return { ...record, enrichmentState: "failed" };
  }
  if (!fetched) return { ...record, enrichmentState: "failed" };
  if (fetched.enrichmentState === "ambiguous") {
    return { ...record, enrichmentState: "ambiguous" };
  }
  if (!metadataMatchesRecord(record, fetched)) {
    return { ...record, enrichmentState: "ambiguous" };
  }

  try {
    const merged = applyAudiobookMetadata(record, fetched);
    if (!merged.cover && options.coversDir && provider.downloadCover) {
      const cover = await persistAudiobookCover(record.id, fetched, provider.downloadCover, options.coversDir);
      if (cover) merged.cover = cover;
    }
    return merged;
  } catch {
    return { ...record, enrichmentState: "failed" };
  }
}

/** Enrich at most maxRecords records, preserving order and untouched invalid entries. */
export async function enrichAudiobooks(
  records: AudiobookRecord[],
  provider: AudiobookEnrichmentProvider,
  options: AudiobookEnrichmentOptions = {},
): Promise<AudiobookRecord[]> {
  const requestedMax = options.maxRecords ?? 25;
  const maxRecords = Number.isFinite(requestedMax) ? Math.max(0, Math.floor(requestedMax)) : 25;
  const result = [...records];
  const candidates = records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => hasUsableTitleAuthor(record) && needsAudiobookEnrichment(record))
    .slice(0, maxRecords);
  const requestedConcurrency = options.concurrency ?? 3;
  const normalizedConcurrency = Number.isFinite(requestedConcurrency) ? Math.floor(requestedConcurrency) : 3;
  const concurrency = Math.max(1, Math.min(normalizedConcurrency, candidates.length || 1, 8));
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor++];
      result[candidate.index] = await enrichAudiobookRecord(candidate.record, provider, options);
    }
  }));
  return result;
}

export function hasUsableTitleAuthor(record: Pick<AudiobookRecord, "title" | "author">): boolean {
  const title = normalizeDisplayText(record.title);
  const author = normalizeDisplayText(record.author);
  return title.length > 1 && author.length > 1 && !/^(?:unbekannt|unknown|n\/a|na|-)$/i.test(author);
}

export function needsAudiobookEnrichment(record: AudiobookRecord): boolean {
  return record.enrichmentState !== "success"
    || !record.cover
    || !normalizeDisplayText(record.description)
    || !validRating(record.rating);
}

function metadataMatchesRecord(record: AudiobookRecord, fetched: AudiobookFetchedMetadata): boolean {
  const title = normalizeMatchKey(record.title);
  const fetchedTitle = normalizeMatchKey(fetched.title || "");
  const author = normalizeMatchKey(record.author);
  const fetchedAuthor = normalizeMatchKey(fetched.author || "");
  return Boolean(title && fetchedTitle && title === fetchedTitle)
    && Boolean(author && fetchedAuthor && (author.includes(fetchedAuthor) || fetchedAuthor.includes(author)));
}

export function applyAudiobookMetadata(record: AudiobookRecord, fetched: AudiobookFetchedMetadata): AudiobookRecord {
  const descriptions = mergeByKey(record.sourceDescriptions || [], cleanDescriptions(fetched.sourceDescriptions || []), (v) => `${v.source}\0${v.url}\0${v.kind}`);
  const ratings = mergeByKey(record.sourceRatings || [], cleanRatings(fetched.sourceRatings || []), (v) => `${v.source}\0${v.url}`);
  const identities = mergeByKey(record.externalIdentities || [], cleanIdentities(fetched.externalIdentities || []), (v) => `${v.source}\0${v.workId || ""}\0${v.editionId || ""}\0${v.isbn || ""}`);
  const reviews = mergeReviews(record.reviews || [], fetched.reviews || []);
  const sourceNames = uniqueNormalizedStrings([
    ...(record.enrichmentSource || "").split("+"),
    ...(fetched.enrichmentSource || fetched.source || "").split("+"),
  ]);
  const publicSources = uniqueUrls([
    ...(record.publicMetadataSources || []),
    ...(fetched.publicMetadataSources || []),
    ...ratings.map((v) => v.url),
    ...descriptions.map((v) => v.url),
    ...identities.map((v) => v.url),
  ]);
  const fetchedDescription = normalizeDisplayText(fetched.description);
  const rating = validRating(record.rating) ? record.rating : validRating(fetched.rating) ? fetched.rating : record.rating;
  const ratingsCount = validCount(record.ratingsCount) ? record.ratingsCount : validCount(fetched.ratingsCount) ? fetched.ratingsCount : record.ratingsCount;
  return {
    ...record,
    description: normalizeDisplayText(record.description) || fetchedDescription || record.description,
    rating,
    ratingsCount,
    reviews,
    sourceRatings: ratings,
    sourceDescriptions: descriptions,
    externalIdentities: identities,
    publicMetadataSources: publicSources,
    enrichmentSource: sourceNames.join("+") || record.enrichmentSource,
    enrichmentState: fetched.enrichmentState || "success",
    metadataStatus: "enriched-public-metadata",
  };
}

async function persistAudiobookCover(
  id: string,
  metadata: AudiobookFetchedMetadata,
  downloadCover: NonNullable<AudiobookEnrichmentProvider["downloadCover"]>,
  coversDir: string,
): Promise<string | null> {
  try {
    fs.mkdirSync(coversDir, { recursive: true });
    const payload = await downloadCover(metadata);
    const bytes = payload !== null && payload !== undefined ? toBuffer(payload) : null;
    const extension = bytes ? rasterImageExtension(bytes) : "";
    if (!bytes || !extension) return null;
    const fileName = `audiobook-${sha256(id)}.${extension}`;
    fs.writeFileSync(path.join(coversDir, fileName), bytes);
    return fileName;
  } catch {
    return null;
  }
}

function toBuffer(payload: Exclude<AudiobookCoverPayload, null | undefined>): Buffer {
  if (Buffer.isBuffer(payload)) return payload;
  if (payload instanceof ArrayBuffer) return Buffer.from(new Uint8Array(payload));
  if (payload instanceof Uint8Array) return Buffer.from(payload);
  return Buffer.from(payload);
}

function validRating(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 5;
}

function validCount(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function cleanRatings(values: BookSourceRating[]): BookSourceRating[] {
  return values.filter((v) => validRating(v.value) && validCount(v.count) && Boolean(v.source));
}

function cleanDescriptions(values: BookSourceDescription[]): BookSourceDescription[] {
  return values.filter((v) => Boolean(v.source) && Boolean(normalizeDisplayText(v.text)));
}

function cleanIdentities(values: BookExternalIdentity[]): BookExternalIdentity[] {
  return values.filter((v) => Boolean(v.source) && Boolean(v.workId || v.editionId || v.isbn));
}

function mergeReviews(existing: BookReview[], incoming: BookReview[]): BookReview[] {
  const valid = incoming.filter((v) => Boolean(normalizeDisplayText(v.text)) && Boolean(normalizeDisplayText(v.source)));
  const map = new Map(existing.filter((v) => Boolean(v.text)).map((v) => [`${v.source}\0${v.author}\0${v.text}`, v]));
  for (const review of valid) map.set(`${review.source}\0${review.author}\0${review.text}`, review);
  return [...map.values()];
}

function uniqueUrls(values: string[]): string[] {
  return [...new Set(values.filter((v) => /^https?:\/\//i.test(v)))];
}
