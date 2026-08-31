import type { FetchedBookMetadata } from "./metadata";
import type { BookRecord } from "./types";
import { mergeByKey, normalizeDisplayText, normalizeMatchKey, uniqueNormalizedStrings } from "./util";
import {
  JUNK_ECONOMICS_AMAZON_IDENTITY,
  MICHAEL_HUDSON_AUTHORITY_ID,
  MICHAEL_HUDSON_AUTHOR_SOURCES,
  MICHAEL_HUDSON_PILOT_TITLES,
  MICHAEL_HUDSON_PILOT_SUMMARIES,
} from "./pilot-enrichment-data";

export function applyFetchedMetadata(book: BookRecord, fetched: FetchedBookMetadata): BookRecord {
  // Conflicting editions/languages are intentionally retained for review by
  // the provider layer, but they are never allowed to overwrite local facts.
  // The visible state gives the queue/UI a deterministic retry/review hook.
  if (fetched.enrichmentState === "ambiguous") {
    return applyMichaelHudsonPilotIdentity({
      ...book,
      enrichmentState: "ambiguous",
    });
  }
  return applyMichaelHudsonPilotIdentity({
    ...book,
    title: normalizeDisplayText(book.title || fetched.title),
    author: normalizeDisplayText(book.author || fetched.author),
    year: book.year || fetched.year,
    language: book.language || fetched.language,
    publisher: book.publisher || fetched.publisher,
    isbn: book.isbn || fetched.isbn,
    pages: book.pages || fetched.pages,
    description: normalizeDisplayText(book.description || fetched.description),
    summary: normalizeDisplayText(book.summary || fetched.description),
    rating: book.rating || fetched.rating,
    ratingsCount: book.ratingsCount || fetched.ratingsCount,
    categories: uniqueNormalizedStrings([...(book.categories || []), ...fetched.categories]),
    enrichmentSource: uniqueNormalizedStrings([...(book.enrichmentSource || "").split("+"), ...fetched.source.split("+")]).join("+"),
    enrichmentState: fetched.enrichmentState || book.enrichmentState || "success",
    source: book.source === "local" ? fetched.source : book.source,
    sourceRatings: mergeByKey(book.sourceRatings || [], fetched.sourceRatings, (value) => `${value.source}\u0000${value.url}`),
    sourceDescriptions: mergeByKey(book.sourceDescriptions || [], fetched.sourceDescriptions, (value) => `${value.source}\u0000${value.url}\u0000${value.kind}`),
    externalIdentities: mergeByKey(book.externalIdentities || [], fetched.externalIdentities, (value) => `${value.source}\u0000${value.workId || ""}\u0000${value.editionId || ""}\u0000${value.isbn || ""}`),
    authorIdentity: preferredAuthorIdentity(book.authorIdentity, fetched.authorIdentity),
  });
}

export function applyMichaelHudsonPilotIdentity(book: BookRecord): BookRecord {
  if (!isMichaelHudsonPilotBook(book)) return book;
  const title = normalizeMatchKey(book.title).replace(/^\.+/, "");
  const junkEconomics = title.startsWith("j is for junk economics");
  const amazonIdentity = junkEconomics ? [JUNK_ECONOMICS_AMAZON_IDENTITY] : [];
  const summaryKey = MICHAEL_HUDSON_PILOT_TITLES.find((candidate) => title.startsWith(candidate));
  const localSummary = summaryKey ? MICHAEL_HUDSON_PILOT_SUMMARIES[summaryKey] : undefined;
  return {
    ...book,
    authorIdentity: {
      id: `open-library:${MICHAEL_HUDSON_AUTHORITY_ID}`,
      authorityIds: { "open-library": MICHAEL_HUDSON_AUTHORITY_ID },
      status: "matched",
    },
    authorSources: mergeByKey(book.authorSources || [], MICHAEL_HUDSON_AUTHOR_SOURCES, (value) => `${value.kind}\u0000${value.url}`),
    externalIdentities: mergeByKey(book.externalIdentities || [], amazonIdentity, (value) => `${value.source}\u0000${value.editionId || ""}`),
    sourceDescriptions: localSummary && !(book.sourceDescriptions || []).some((value) => value.text)
      ? [localSummary]
      : book.sourceDescriptions,
  };
}

export function isMichaelHudsonPilotBook(book: BookRecord): boolean {
  const author = normalizeMatchKey(book.author);
  const title = normalizeMatchKey(book.title).replace(/^\.+/, "");
  return author === "michael hudson"
    && MICHAEL_HUDSON_PILOT_TITLES.some((candidate) => title.startsWith(candidate));
}

function preferredAuthorIdentity(
  existing: BookRecord["authorIdentity"],
  incoming: BookRecord["authorIdentity"]
): BookRecord["authorIdentity"] {
  if (!existing) return incoming;
  if (!incoming) return existing;
  if (incoming.status === "matched" && existing.status !== "matched") return incoming;
  return existing;
}
