import { requestUrl } from "obsidian";
import type {
  AuthorIdentity,
  BookExternalIdentity,
  BookSourceDescription,
  BookSourceRating,
  EnrichmentState,
} from "./types";
import { normalizeDisplayText, normalizeMatchKey } from "./util";

export interface FetchedBookMetadata {
  title: string;
  author: string;
  year: string;
  language: string;
  publisher: string;
  isbn: string;
  pages: string;
  coverUrl: string;
  description: string;
  rating: number;
  ratingsCount: number;
  categories: string[];
  source: string;
  sourceUrl: string;
  sourceRatings: BookSourceRating[];
  sourceDescriptions: BookSourceDescription[];
  externalIdentities: BookExternalIdentity[];
  authorIdentity?: AuthorIdentity;
  /**
   * `partial` means at least one optional provider failed. `ambiguous` means
   * that matching candidates conflict and must not overwrite trusted fields.
   * The field is optional to keep the existing provider-result API stable.
   */
  enrichmentState?: EnrichmentState;
  /** Sources that could not be consulted for this otherwise usable result. */
  providerFailures?: string[];
}

export type HttpGet = (url: string) => Promise<{ status: number; text: string; arrayBuffer?: ArrayBuffer }>;

export type RasterImageExtension = "jpg" | "png" | "webp" | "gif";

const MAX_COVER_BYTES = 10 * 1024 * 1024;

type MetadataTarget = {
  title?: string;
  author?: string;
  isbn?: string;
  language?: string;
};

type ProviderName = "open-library" | "google-books";

interface ProviderLookup {
  source: ProviderName;
  candidates: FetchedBookMetadata[];
  failure?: "http" | "malformed";
}

export function rasterImageExtension(value: Uint8Array): RasterImageExtension | "" {
  if (value.length >= 3 && value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff) return "jpg";
  if (value.length >= 8 && value.subarray(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])) return "png";
  if (value.length >= 12 && Buffer.from(value.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(value.subarray(8, 12)).toString("ascii") === "WEBP") return "webp";
  if (value.length >= 6 && (Buffer.from(value.subarray(0, 6)).toString("ascii") === "GIF87a" || Buffer.from(value.subarray(0, 6)).toString("ascii") === "GIF89a")) return "gif";
  return "";
}

function defaultHttpGet(url: string): Promise<{ status: number; text: string }> {
  return requestUrl({ url, throw: false }).then((res) => ({ status: res.status, text: res.text }));
}

function clean(value: string | undefined): string {
  return normalizeDisplayText(value);
}

export class MetadataProvider {
  private http: HttpGet;

  constructor(http: HttpGet = defaultHttpGet) {
    this.http = http;
  }

  async downloadCover(url: string): Promise<Buffer | null> {
    const trustedUrl = trustedBookCoverUrl(url);
    if (!trustedUrl) return null;
    const res = await this.http(trustedUrl);
    if (res.status !== 200) return null;
    if (res.arrayBuffer) {
      const bytes = Buffer.from(res.arrayBuffer);
      return bytes.length <= MAX_COVER_BYTES && rasterImageExtension(bytes) ? bytes : null;
    }
    const comma = res.text.indexOf(",");
    if (comma > 0) {
      const bytes = Uint8Array.from(atob(res.text.slice(comma + 1)), (c) => c.charCodeAt(0));
      const cover = Buffer.from(bytes);
      return cover.length <= MAX_COVER_BYTES && rasterImageExtension(cover) ? cover : null;
    }
    return null;
  }

  async fetchByIsbn(isbn: string, language = ""): Promise<FetchedBookMetadata | null> {
    const normalizedIsbn = normalizeIsbn(isbn);
    if (!normalizedIsbn) return null;
    return this.fetchFromProviders(
      { isbn: normalizedIsbn, language },
      [
        { source: "open-library", request: () => this.openLibraryByIsbn(normalizedIsbn) },
        { source: "google-books", request: () => this.googleBooksByQuery(`isbn:${normalizedIsbn}`) },
      ]
    );
  }

  async fetchByTitleAuthor(title: string, author: string, language = ""): Promise<FetchedBookMetadata | null> {
    const query = [title, author].filter(Boolean).join(" ");
    if (!query) return null;
    return this.fetchFromProviders(
      { title, author, language },
      [
        { source: "open-library", request: () => this.openLibraryByQuery(query) },
        { source: "google-books", request: () => this.googleBooksByQuery(query) },
      ]
    );
  }

  /**
   * Keeps each provider independent: a timeout, quota response or malformed
   * payload from one source must never discard another source's usable data.
   */
  private async fetchFromProviders(
    target: MetadataTarget,
    providers: Array<{ source: ProviderName; request: () => Promise<ProviderLookup> }>
  ): Promise<FetchedBookMetadata | null> {
    const settled = await Promise.allSettled(providers.map((provider) => provider.request()));
    const candidates: FetchedBookMetadata[] = [];
    const failures: string[] = [];
    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index];
      const provider = providers[index];
      if (result.status === "rejected") {
        failures.push(provider.source);
        continue;
      }
      candidates.push(...result.value.candidates);
      if (result.value.failure) failures.push(provider.source);
    }
    const merged = mergeBookMetadataCandidates(candidates, target);
    if (!merged) return null;
    const enrichmentState: EnrichmentState = merged.enrichmentState === "ambiguous"
      ? "ambiguous"
      : failures.length > 0
        ? "partial"
        : "success";
    return {
      ...merged,
      enrichmentState,
      ...(failures.length ? { providerFailures: [...new Set(failures)] } : {}),
    };
  }

  private async openLibraryByIsbn(isbn: string): Promise<ProviderLookup> {
    const res = await this.http(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&jscmd=data&format=json`);
    if (res.status !== 200) return { source: "open-library", candidates: [], failure: "http" };
    try {
      const data = JSON.parse(res.text);
      const entry = data[`ISBN:${isbn}`];
      if (!entry) return { source: "open-library", candidates: [] };
      return { source: "open-library", candidates: [this.mapOpenLibrary(entry, isbn)] };
    } catch {
      return { source: "open-library", candidates: [], failure: "malformed" };
    }
  }

  private async openLibraryByQuery(query: string): Promise<ProviderLookup> {
    const res = await this.http(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10&fields=key,title,author_name,author_key,first_publish_year,language,publisher,isbn,number_of_pages_median,cover_i,subtitle,ratings_average,ratings_count`
    );
    if (res.status !== 200) return { source: "open-library", candidates: [], failure: "http" };
    try {
      const data = JSON.parse(res.text);
      const docs = Array.isArray(data.docs) ? data.docs : [];
      return {
        source: "open-library",
        candidates: docs.map((doc: unknown) => {
          const record = isRecord(doc) ? doc : {};
          return this.mapOpenLibrary(record, firstIsbn(record.isbn));
        }),
      };
    } catch {
      return { source: "open-library", candidates: [], failure: "malformed" };
    }
  }

  private mapOpenLibrary(doc: any, isbn: string): FetchedBookMetadata {
    const title = clean(doc.title || doc.subtitle);
    const author = Array.isArray(doc.author_name) ? doc.author_name.join(", ") : clean(doc.author_name || doc.authors?.[0]?.name);
    const coverUrl = doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : clean(doc.cover?.medium || doc.cover?.large || doc.cover?.small || "");
    const checkedAt = new Date().toISOString();
    const workId = openLibraryIdentifier(doc, "works");
    // `edition_key` in an Open Library work search is a list of related
    // editions, not evidence for one chosen edition. Persist an edition only
    // when the provider actually returned a `/books/…` identifier.
    const editionId = openLibraryIdentifier(doc, "books");
    const authorId = Array.isArray(doc.author_key)
      ? clean(doc.author_key[0])
      : clean(doc.authors?.[0]?.key || "").replace(/^\/authors\//, "");
    const sourceUrl = workId
      ? `https://openlibrary.org/works/${encodeURIComponent(workId)}`
      : editionId
        ? `https://openlibrary.org/books/${encodeURIComponent(editionId)}`
        : "https://openlibrary.org/";
    const rating = typeof doc.ratings_average === "number" ? doc.ratings_average : 0;
    const ratingsCount = typeof doc.ratings_count === "number" ? doc.ratings_count : 0;
    const locale = Array.isArray(doc.language) ? clean(doc.language[0]) : clean(doc.language);
    return {
      title,
      author,
      year: doc.first_publish_year ? String(doc.first_publish_year) : "",
      language: Array.isArray(doc.language) ? doc.language[0] || "" : clean(doc.language),
      publisher: Array.isArray(doc.publisher) ? doc.publisher[0] || "" : clean(doc.publisher),
      isbn,
      pages: doc.number_of_pages_median ? String(doc.number_of_pages_median) : "",
      coverUrl,
      description: "",
      rating,
      ratingsCount,
      categories: [],
      source: "open-library",
      sourceUrl,
      sourceRatings: rating ? [{
        source: "open-library", url: sourceUrl, locale, checkedAt, matchConfidence: 0,
        value: rating, count: ratingsCount, status: "provider-reported",
      }] : [],
      sourceDescriptions: [],
      externalIdentities: (workId || editionId || isbn) ? [{
        source: "open-library", url: sourceUrl, locale, checkedAt, matchConfidence: 0,
        workId: workId || undefined, editionId: editionId || undefined, isbn: isbn || undefined,
      }] : [],
      // An authority ID from a search response alone is not proof that it is
      // the same person. `mergeBookMetadataCandidates` upgrades this only
      // when the requested edition has strong identifier evidence.
      authorIdentity: authorId ? {
        id: `open-library:${authorId}`,
        authorityIds: { "open-library": authorId },
        status: "ambiguous",
      } : undefined,
    };
  }

  private async googleBooksByQuery(query: string): Promise<ProviderLookup> {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10`;
    const res = await this.http(url);
    if (res.status !== 200) return { source: "google-books", candidates: [], failure: "http" };
    try {
      const data = JSON.parse(res.text);
      const items = Array.isArray(data.items) ? data.items : [];
      return {
        source: "google-books",
        candidates: items.map((item: unknown) => this.mapGoogleBooks(isRecord(item) ? item : {})),
      };
    } catch {
      return { source: "google-books", candidates: [], failure: "malformed" };
    }
  }

  private mapGoogleBooks(item: any): FetchedBookMetadata {
    const info = item.volumeInfo || {};
    const industryId = Array.isArray(info.industryIdentifiers)
      ? info.industryIdentifiers.find((id: any) => id.type === "ISBN_13" || id.type === "ISBN_10")
      : undefined;
    const imageLinks = info.imageLinks || {};
    const checkedAt = new Date().toISOString();
    const sourceUrl = clean(info.infoLink || item.selfLink || (item.id ? `https://books.google.com/books?id=${item.id}` : "https://books.google.com/"));
    const locale = clean(info.language);
    const description = clean(info.description || "");
    const rating = typeof info.averageRating === "number" ? info.averageRating : 0;
    const ratingsCount = typeof info.ratingsCount === "number" ? info.ratingsCount : 0;
    return {
      title: clean(info.title),
      author: Array.isArray(info.authors) ? info.authors.join(", ") : "",
      year: info.publishedDate ? info.publishedDate.slice(0, 4) : "",
      language: clean(info.language),
      publisher: clean(info.publisher),
      isbn: clean(industryId?.identifier),
      pages: info.pageCount ? String(info.pageCount) : "",
      coverUrl: clean(imageLinks.extraLarge || imageLinks.large || imageLinks.medium || imageLinks.thumbnail || imageLinks.smallThumbnail),
      description,
      rating,
      ratingsCount,
      categories: Array.isArray(info.categories) ? info.categories.map(clean) : [],
      source: "google-books",
      sourceUrl,
      sourceRatings: rating ? [{
        source: "google-books", url: sourceUrl, locale, checkedAt, matchConfidence: 0,
        value: rating, count: ratingsCount, status: "provider-reported",
      }] : [],
      sourceDescriptions: description ? [{
        source: "google-books", url: sourceUrl, locale, checkedAt, matchConfidence: 0,
        text: description, kind: "source",
      }] : [],
      externalIdentities: (item.id || industryId?.identifier) ? [{
        source: "google-books", url: sourceUrl, locale, checkedAt, matchConfidence: 0,
        editionId: clean(item.id) || undefined, isbn: clean(industryId?.identifier) || undefined,
      }] : [],
    };
  }
}

export function trustedBookCoverUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLocaleLowerCase();
    const trustedHost = host === "covers.openlibrary.org"
      || host === "books.google.com"
      || host === "books.googleusercontent.com"
      || host.endsWith(".googleusercontent.com");
    if (!trustedHost || (url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}

export function mergeBookMetadataCandidates(
  values: Array<FetchedBookMetadata | null>,
  target: MetadataTarget
): FetchedBookMetadata | null {
  const accepted = values
    .filter((value): value is FetchedBookMetadata => Boolean(value))
    .map((value) => ({ value, confidence: metadataMatchConfidence(value, target) }))
    .filter((entry) => entry.confidence >= 0.8);
  if (accepted.length === 0) return null;

  const ambiguous = hasCandidateConflict(accepted, target);
  const preferred = accepted.find((entry) => entry.value.source === "open-library") || accepted[0];
  const richerDescription = [...accepted]
    .filter((entry) => entry.value.description)
    .sort((a, b) => b.confidence - a.confidence || b.value.description.length - a.value.description.length)[0];
  const richerRating = [...accepted]
    .filter((entry) => entry.value.rating > 0)
    .sort((a, b) => b.confidence - a.confidence || b.value.ratingsCount - a.value.ratingsCount)[0];
  type StringMetadataKey = "title" | "author" | "year" | "language" | "publisher" | "isbn" | "pages" | "coverUrl";
  const pick = (key: StringMetadataKey): string =>
    accepted.map((entry) => entry.value[key]).find(Boolean) || preferred.value[key];
  const sources = [...new Set(accepted.map((entry) => entry.value.source))];
  const withConfidence = <T extends { matchConfidence: number }>(records: T[], confidence: number): T[] =>
    records.map((record) => ({ ...record, matchConfidence: confidence }));
  const authorIdentity = accepted
    .map((entry) => resolveAuthorIdentity(entry.value.authorIdentity, entry.value, target))
    .filter((identity): identity is AuthorIdentity => Boolean(identity))
    .sort((a, b) => Number(b.status === "matched") - Number(a.status === "matched"))[0];

  return {
    ...preferred.value,
    title: pick("title"),
    author: pick("author"),
    year: pick("year"),
    language: pick("language"),
    publisher: pick("publisher"),
    isbn: pick("isbn"),
    pages: pick("pages"),
    coverUrl: pick("coverUrl"),
    description: richerDescription?.value.description || "",
    rating: richerRating?.value.rating || 0,
    ratingsCount: richerRating?.value.ratingsCount || 0,
    categories: [...new Set(accepted.flatMap((entry) => entry.value.categories).filter(Boolean))],
    source: sources.join("+"),
    sourceUrl: preferred.value.sourceUrl,
    sourceRatings: accepted.flatMap((entry) => withConfidence(entry.value.sourceRatings, entry.confidence)),
    sourceDescriptions: accepted.flatMap((entry) => withConfidence(entry.value.sourceDescriptions, entry.confidence)),
    externalIdentities: accepted.flatMap((entry) => withConfidence(entry.value.externalIdentities, entry.confidence)),
    authorIdentity,
    ...(ambiguous ? { enrichmentState: "ambiguous" as const } : {}),
  };
}

function metadataMatchConfidence(
  candidate: FetchedBookMetadata,
  target: MetadataTarget
): number {
  const targetIsbn = canonicalIsbn(target.isbn || "");
  const candidateIsbn = canonicalIsbn(candidate.isbn);
  if (targetIsbn) return targetIsbn === candidateIsbn ? 1 : 0;
  const targetTitle = normalizeMatchKey(target.title || "");
  const candidateTitle = normalizeMatchKey(candidate.title);
  if (!targetTitle || targetTitle !== candidateTitle) return 0;
  const targetAuthor = normalizeMatchKey(target.author || "");
  const candidateAuthor = normalizeMatchKey(candidate.author);
  if (targetAuthor && (!candidateAuthor || (!candidateAuthor.includes(targetAuthor) && !targetAuthor.includes(candidateAuthor)))) return 0;
  const targetLanguage = languageKey(target.language || "");
  const candidateLanguage = languageKey(candidate.language);
  if (targetLanguage && candidateLanguage && targetLanguage !== candidateLanguage) return 0;
  if (!targetAuthor) return targetLanguage && candidateLanguage ? 0.9 : 0.85;
  return targetLanguage && candidateLanguage ? 0.98 : 0.95;
}

function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9x]/gi, "").toLocaleUpperCase();
}

function canonicalIsbn(value: string): string {
  const isbn = normalizeIsbn(value);
  if (isbn.length !== 10) return isbn;
  const body = `978${isbn.slice(0, 9)}`;
  let sum = 0;
  for (let index = 0; index < body.length; index += 1) {
    sum += Number(body[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return `${body}${(10 - (sum % 10)) % 10}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstIsbn(value: unknown): string {
  if (Array.isArray(value)) {
    const isbn13 = value.find((entry): entry is string => typeof entry === "string" && canonicalIsbn(entry).length === 13);
    const first = value.find((entry): entry is string => typeof entry === "string");
    return clean(isbn13 || first || "");
  }
  return clean(typeof value === "string" ? value : "");
}

function openLibraryIdentifier(doc: any, collection: "works" | "books"): string {
  const candidates = [
    doc.key,
    doc.url,
    Array.isArray(doc.works) ? doc.works[0]?.key : undefined,
  ];
  for (const candidate of candidates) {
    const value = clean(typeof candidate === "string" ? candidate : "");
    const match = value.match(new RegExp(`/(?:${collection})/([^/?#]+)`, "i"));
    if (match?.[1]) return match[1];
    const bareId = collection === "works" ? /^OL[\dA-Z]+W$/i : /^OL[\dA-Z]+M$/i;
    if (bareId.test(value)) return value;
  }
  return "";
}

function languageKey(value: string): string {
  const raw = clean(value).toLocaleLowerCase().split(/[,_-]/)[0];
  const aliases: Record<string, string> = {
    eng: "en", en: "en",
    deu: "de", ger: "de", de: "de",
    fra: "fr", fre: "fr", fr: "fr",
    spa: "es", es: "es",
    ita: "it", it: "it",
    por: "pt", pt: "pt",
    nld: "nl", nl: "nl",
    pol: "pl", pl: "pl",
    jpn: "ja", ja: "ja",
    swe: "sv", sv: "sv",
    tur: "tr", tr: "tr",
  };
  return aliases[raw] || raw;
}

function hasCandidateConflict(
  accepted: Array<{ value: FetchedBookMetadata; confidence: number }>,
  target: MetadataTarget
): boolean {
  const targetLanguage = languageKey(target.language || "");
  const languages = new Set(accepted.map((entry) => languageKey(entry.value.language)).filter(Boolean));
  if (targetLanguage && [...languages].some((language) => language !== targetLanguage)) return true;
  if (accepted.length < 2) return false;
  if (!targetLanguage && languages.size > 1) return true;
  const targetIsbn = canonicalIsbn(target.isbn || "");
  if (targetIsbn) return false;
  const editions = new Set(accepted.map((entry) => canonicalIsbn(entry.value.isbn)).filter(Boolean));
  return editions.size > 1;
}

function resolveAuthorIdentity(
  identity: AuthorIdentity | undefined,
  candidate: FetchedBookMetadata,
  target: MetadataTarget
): AuthorIdentity | undefined {
  if (!identity) return undefined;
  const targetIsbn = canonicalIsbn(target.isbn || "");
  const hasStrongEditionEvidence = Boolean(targetIsbn && canonicalIsbn(candidate.isbn) === targetIsbn);
  return {
    ...identity,
    status: hasStrongEditionEvidence ? "matched" : "ambiguous",
  };
}
