import type { BookExternalIdentity, BookSourceDescription, BookSourceRating, BookSourceRecord } from "./types";
import { normalizeDisplayText } from "./util";

export function normalizeSourceRatings(values: unknown[]): BookSourceRating[] {
  const statuses = new Set<BookSourceRating["status"]>(["provider-reported", "unverified", "user-confirmed"]);
  return values.flatMap((value) => {
    const base = normalizeSourceBase(value);
    if (!base || !isRecord(value) || !Number.isFinite(value.value) || !Number.isFinite(value.count)) return [];
    const rating = Number(value.value);
    const count = Number(value.count);
    const status = value.status as BookSourceRating["status"];
    if (rating < 0 || rating > 5 || count < 0 || !statuses.has(status)) return [];
    return [{ ...base, value: rating, count, status }];
  });
}

export function normalizeSourceDescriptions(values: unknown[]): BookSourceDescription[] {
  return values.flatMap((value) => {
    const base = normalizeSourceBase(value);
    if (!base || !isRecord(value)) return [];
    const text = normalizeDisplayText(typeof value.text === "string" ? value.text : "");
    if (!text || (value.kind !== "source" && value.kind !== "ai-summary")) return [];
    const inputSources = Array.isArray(value.inputSources)
      ? value.inputSources.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
      : undefined;
    return [{ ...base, text, kind: value.kind, ...(inputSources?.length ? { inputSources } : {}) }];
  });
}

export function normalizeExternalIdentities(values: unknown[]): BookExternalIdentity[] {
  return values.flatMap((value) => {
    const base = normalizeSourceBase(value);
    if (!base || !isRecord(value)) return [];
    const workId = normalizeDisplayText(typeof value.workId === "string" ? value.workId : "");
    const editionId = normalizeDisplayText(typeof value.editionId === "string" ? value.editionId : "");
    const isbn = normalizeDisplayText(typeof value.isbn === "string" ? value.isbn : "");
    if (!workId && !editionId && !isbn) return [];
    return [{ ...base, ...(workId ? { workId } : {}), ...(editionId ? { editionId } : {}), ...(isbn ? { isbn } : {}) }];
  });
}

export function normalizeSourceBase(value: unknown): BookSourceRecord | null {
  if (!isRecord(value)) return null;
  const source = normalizeDisplayText(typeof value.source === "string" ? value.source : "");
  const url = typeof value.url === "string" ? value.url.trim() : "";
  const locale = normalizeDisplayText(typeof value.locale === "string" ? value.locale : "");
  const checkedAt = typeof value.checkedAt === "string" ? value.checkedAt.trim() : "";
  const matchConfidence = Number(value.matchConfidence);
  if (!source || !/^https?:\/\//i.test(url) || !Number.isFinite(matchConfidence) || matchConfidence < 0 || matchConfidence > 1) return null;
  return { source, url, locale, checkedAt, matchConfidence };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
