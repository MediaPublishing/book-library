import type { Language, LanguageSetting } from "./i18n";
import { DEFAULT_LIBRARY_UI_STATE, type LibraryUiState } from "./library-ui-state";

export type BookFormat = "epub" | "pdf" | "other";

export interface BookReview {
  source: string;
  author: string;
  rating: number;
  text: string;
}

export interface BookSourceRecord {
  source: string;
  url: string;
  locale: string;
  checkedAt: string;
  matchConfidence: number;
}

export interface BookSourceRating extends BookSourceRecord {
  value: number;
  count: number;
  status: "provider-reported" | "unverified" | "user-confirmed";
}

export interface BookSourceDescription extends BookSourceRecord {
  text: string;
  kind: "source" | "ai-summary";
  inputSources?: string[];
}

export interface BookExternalIdentity extends BookSourceRecord {
  workId?: string;
  editionId?: string;
  isbn?: string;
}

/**
 * Ergebnis eines externen Anreicherungsversuchs. Der Feldzustand bleibt
 * optional, damit ältere Indexe und Katalognotizen unverändert lesbar sind.
 */
export type EnrichmentState = "success" | "partial" | "ambiguous" | "failed";

export interface AuthorIdentity {
  id: string;
  authorityIds: Record<string, string>;
  status: "matched" | "local-name-match" | "ambiguous";
}

export interface AuthorSourceRecord extends BookSourceRecord {
  kind: "biography" | "profile" | "works";
  text?: string;
  works?: string[];
}

export interface BookRecord {
  /**
   * Stabile technische ID. Sie lebt im Index und wird nicht in der sichtbaren
   * Katalognotiz dargestellt.
   */
  hash: string;
  file: string;
  format: BookFormat;
  size: number;
  mtime: number;
  cover: string;
  ingested: string;
  title: string;
  author: string;
  year: string;
  language: string;
  publisher: string;
  isbn: string;
  pages: string;
  tags: string[];
  source: string;
  summary: string;
  related: string[];
  wikiStatus: "none" | "queued" | "done" | "failed";
  markdownPath: string;
  /** Vollständige Verlags- oder Händlerbeschreibung, sofern verfügbar. */
  description?: string;
  /** Aggregierte Bewertung 0–5; 0 bedeutet „unbekannt“. */
  rating?: number;
  /** Anzahl abgegebener Bewertungen; 0 bedeutet „unbekannt“. */
  ratingsCount?: number;
  /** Verlagskategorien aus externen Quellen, nicht nur Ordner-Tags. */
  categories?: string[];
  /** Kurze, wiederkehrende Themen oder Kernideen des Buches. */
  themes?: string[];
  /** Rezensionen aus öffentlichen Quellen (opt-in). */
  reviews?: BookReview[];
  /** Welche Quelle die Anreicherung geliefert hat, z. B. google-books. */
  enrichmentSource?: string;
  /** Vertrauenswürdiger Ergebniszustand der letzten externen Anreicherung. */
  enrichmentState?: EnrichmentState;
  /** Quellengetrennte Ratings; der Legacy-Wert bleibt als Projektion erhalten. */
  sourceRatings?: BookSourceRating[];
  /** Quellengetrennte Beschreibungen oder klar markierte AI-Zusammenfassungen. */
  sourceDescriptions?: BookSourceDescription[];
  /** Aufgelöste Werk- und Ausgabenidentitäten der Metadatenanbieter. */
  externalIdentities?: BookExternalIdentity[];
  /** Stabile Autoridentität für die typisierte Autorennavigation. */
  authorIdentity?: AuthorIdentity;
  /** Kollisionsfreier Dateiname des erzeugten Autorenprofils. */
  authorProfilePath?: string;
  /** Geprüfte Quellen für das typisierte Autorenprofil. */
  authorSources?: AuthorSourceRecord[];
  /** Optionaler, kollisionsfreier Pfad zur Hauptnotiz des erzeugten Wikis. */
  wikiPath?: string;
  /** Lesbarer Dateiname innerhalb von `catalogDir`, beispielsweise `Titel — Autor.md`. */
  catalogPath?: string;
}

export interface BookIndex {
  version: number;
  generatedAt: string;
  entries: Record<string, BookRecord>;
}

export type AudiobookMediaType = "audiobook" | "series" | "periodical";

export type AudiobookSynopsisStatus = "inventory-note" | "verified";

export type AudiobookSourceVisibility = "public" | "private" | "local";

export interface AudiobookRecord {
  id: string;
  sourceName: string;
  /** Generic storage provider, for example local, web, Dropbox, Google Drive or mega. */
  sourceProvider?: string;
  sourceVisibility?: AudiobookSourceVisibility;
  /** Neutral storage location shown to users. Legacy indexes fall back to legacyPrivatePath. */
  storagePath?: string;
  /** Canonical external URL for the audiobook, regardless of provider. */
  sourceLink?: string | null;
  /** Legacy index field for the neutral storage path. */
  legacyPrivatePath: string;
  mediaType: AudiobookMediaType;
  title: string;
  author: string;
  narrator: string;
  duration: string;
  audioFormats: string[];
  audioFileCount: number;
  audioBytes: number;
  audioLastModified: string;
  language: string;
  year: string;
  category: string[];
  synopsis: string;
  synopsisStatus: AudiobookSynopsisStatus;
  synopsisSource: string;
  sourceMetadataFiles: string[];
  localBookSources: string[];
  sourceStatus: "verified-storage-path" | "verified-local-path" | "manual";
  metadataStatus: "inventory-indexed" | "matched-book" | "needs-enrichment" | "enriched-local-metadata" | "enriched-public-metadata" | "manual";
  matchStatus: "matched" | "unmatched" | "ambiguous";
  relatedBooks: string[];
  /** Legacy index field; new indexes store related topic links in category. */
  relatedTopicLinks: string[];
  /** Dateiname relativ zu `_audiobooks/covers`; leer bis ein Cover erzeugt wurde. */
  cover: string;
  /** Legacy field for a provider-specific public URL; new indexes prefer sourceLink. */
  legacyPublicLink: string | null;
  /** Legacy field for a provider-specific private URL; new indexes use sourceLink. */
  legacyPrivateUrl: string | null;
  /** Public bibliographic sources only; never a private storage share. */
  publicMetadataSources: string[];
  catalogPath: string;
}

export interface AudiobookIndex {
  version: number;
  generatedAt: string;
  source: {
    provider: string;
    visibility: AudiobookSourceVisibility;
    root: string;
    inventoryReadback: string;
  };
  entries: Record<string, AudiobookRecord>;
}

export interface ManualAudiobookInput {
  title: string;
  author: string;
  storagePath?: string;
  sourceLink?: string;
  categories?: string[];
  synopsis?: string;
}

export interface ScanOptions {
  libraryPath: string;
  catalogDir: string;
  coversDir: string;
  wikiDir: string;
  includeExtensions: string[];
  tagsFromFolders: boolean;
  fetchMetadata: boolean;
  /** Begrenzung externer Metadatenanfragen pro Scan; fehlt in älteren Aufrufen. */
  maxMetadataLookups?: number;
  maxFiles: number;
  language: Language;
  amazonUrlTemplate?: string;
  goodreadsUrlTemplate?: string;
}

export interface ScanProgress {
  scanned: number;
  total: number;
  current: string;
  status: "idle" | "running" | "done" | "error";
  error?: string;
}

export interface AiProviderConfig {
  provider: "none" | "codex" | "opencode" | "claude" | "openrouter" | "local";
  model: string;
  apiKey: string;
  baseUrl: string;
  budgetCents: number;
  maxBooksPerRun: number;
  maxTokensPerBook: number;
}

export interface LibrarySettings {
  language: LanguageSetting;
  libraryPath: string;
  audiobookLibraryPath: string;
  catalogDir: string;
  audiobookCatalogDir: string;
  coversDir: string;
  markdownDir: string;
  wikiDir: string;
  includeExtensions: string[];
  maxScanFiles: number;
  tagsFromFolders: boolean;
  fetchMetadata: boolean;
  openRouterModel: string;
  openRouterBaseUrl: string;
  openRouterApiKey: string;
  codexCommand: string;
  opencodeCommand: string;
  claudeCommand: string;
  localModelCommand: string;
  aiProvider: AiProviderConfig["provider"];
  aiModel: string;
  aiCoverProvider: "none" | "openai";
  openAiApiKey: string;
  aiCoverModel: string;
  aiCoverSize: string;
  aiCoverBatchSize: number;
  budgetCents: number;
  maxBooksPerRun: number;
  maxTokensPerBook: number;
  proLicenseKey: string;
  stripePaymentLink: string;
  checkoutEndpoint: string;
  amazonUrlTemplate: string;
  goodreadsUrlTemplate: string;
  detailsExpanded: boolean;
  technicalDetailsExpanded: boolean;
  detailMode: "product" | "minimal";
  reviewsEnabled: boolean;
  libraryUiState: LibraryUiState;
}

export const DEFAULT_SETTINGS: LibrarySettings = {
  language: "auto",
  libraryPath: "",
  audiobookLibraryPath: "",
  catalogDir: "_catalog",
  audiobookCatalogDir: "_audiobooks",
  coversDir: "_catalog/covers",
  markdownDir: "_books",
  wikiDir: "_wiki",
  includeExtensions: ["epub", "pdf"],
  maxScanFiles: 50000,
  tagsFromFolders: true,
  fetchMetadata: true,
  openRouterModel: "openai/gpt-4o-mini",
  openRouterBaseUrl: "https://openrouter.ai/api/v1/chat/completions",
  openRouterApiKey: "",
  codexCommand: "codex",
  opencodeCommand: "opencode",
  claudeCommand: "claude",
  localModelCommand: "",
  aiProvider: "none",
  aiModel: "",
  aiCoverProvider: "none",
  openAiApiKey: "",
  aiCoverModel: "gpt-image-2",
  aiCoverSize: "1024x1024",
  aiCoverBatchSize: 16,
  budgetCents: 100,
  maxBooksPerRun: 10,
  maxTokensPerBook: 12000,
  proLicenseKey: "",
  stripePaymentLink: "",
  checkoutEndpoint: "",
  amazonUrlTemplate: "https://www.amazon.com/s?k={query}",
  goodreadsUrlTemplate: "https://www.goodreads.com/search?q={query}",
  detailsExpanded: false,
  technicalDetailsExpanded: false,
  detailMode: "product",
  reviewsEnabled: false,
  libraryUiState: DEFAULT_LIBRARY_UI_STATE,
};

export const CATALOG_VERSION = 2;
