import * as path from "path";
import type { BookRecord } from "./types";
import { translate, type Language, type TranslationKey } from "./i18n";
import { humanizeSource, normalizeDisplayText, ratingStars, slugify, wikiChapterPath, wikiMainPath } from "./util";
import { authorProfileLink } from "./author-id";
import { amazonSearchDestination } from "./marketplace";

export interface CatalogRenderOptions {
  language: Language;
  wikiDir: string;
  coversDir?: string;
  titles?: Record<string, string>;
  /** Dateinamen innerhalb des Katalogordners, nach technischer ID indiziert. */
  catalogPaths?: Record<string, string>;
  amazonUrlTemplate?: string;
  goodreadsUrlTemplate?: string;
  topicsDir?: string;
  authorsDir?: string;
}

export interface CatalogNameRecord {
  title: string;
  author: string;
  catalogPath?: string;
}

const LEGACY_HASH_NOTE = /^[a-f0-9]{64}\.md$/i;
const MAX_CATALOG_FILENAME_LENGTH = 180;

/**
 * Erzeugt einen für Menschen lesbaren Dateinamen. Technische IDs gehören
 * bewusst nicht in die sichtbare Datei- oder Tab-Bezeichnung.
 */
export function catalogFileName(record: CatalogNameRecord): string {
  const existing = readableCatalogFileName(record.catalogPath || "");
  if (existing) return existing;
  const title = safeFilenamePart(record.title || "Ohne Titel");
  const author = safeFilenamePart(record.author);
  const label = author ? `${title} — ${author}` : title;
  return `${truncateFilename(label || "Ohne Titel")}.md`;
}

/**
 * Vergibt kollisionsfreie, stabile, lesbare Namen. Die Sortierung nach ID
 * sorgt auch bei gleichnamigen Ausgaben für reproduzierbare Zusätze.
 */
export function assignCatalogFileNames<T extends CatalogNameRecord>(
  records: T[],
  identifier: (record: T) => string
): Record<string, string> {
  const assigned: Record<string, string> = {};
  const claimed = new Set<string>();
  for (const record of [...records].sort((a, b) => identifier(a).localeCompare(identifier(b)))) {
    const preferred = catalogFileName(record);
    const filename = uniqueCatalogFileName(preferred, claimed);
    assigned[identifier(record)] = filename;
    claimed.add(filename.toLocaleLowerCase());
  }
  return assigned;
}

/** Erzeugt ein Obsidian-Linkziel ohne die Dateiendung. */
export function catalogLinkTarget(catalogPath: string, catalogDir = ""): string {
  const candidate = catalogPath.trim();
  const filename = candidate && !candidate.includes("/") && !candidate.includes("\\")
    ? candidate
    : catalogFileName({ title: "Ohne Titel", author: "", catalogPath });
  const stem = filename.replace(/\.md$/i, "");
  return catalogDir ? `${catalogDir.replace(/\/+$/, "")}/${stem}` : stem;
}

export function renderCatalogRecord(record: BookRecord, options: CatalogRenderOptions): string {
  const language = options.language;
  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(language, key, params);
  const recordTitle = normalizeDisplayText(record.title);
  const recordAuthor = normalizeDisplayText(record.author);
  const summary = normalizeDisplayText(record.summary);
  const title = recordTitle || "Untitled";
  const authorLink = recordAuthor
    ? `[[${authorProfileLink(record, options.authorsDir || "_catalog/authors")}|${recordAuthor}]]`
    : "";
  const metaLine = [
    authorLink ? `**${t("catalog.metaAuthor")}:** ${authorLink}` : "",
    record.year ? `**${t("catalog.metaYear")}:** ${record.year}` : "",
    record.format ? `**${t("catalog.metaFormat")}:** ${record.format}` : "",
    record.pages ? `**${t("catalog.metaPages")}:** ${record.pages}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const coverEmbed = record.cover ? `![[covers/${record.cover}|120]]` : (language === "de" ? "_Kein Cover vorhanden._" : "_No cover available._");
  const contents: string[] = [];
  if (record.wikiStatus === "done") {
    const mainPath = record.wikiPath || wikiMainPath(record, options.wikiDir);
    const folder = path.posix.dirname(mainPath);
    const stem = path.posix.basename(mainPath, ".md");
    contents.push(`- [[${mainPath}|${title} — Wiki]]`);
    for (let index = 0; index < 8; index++) {
      const chapter = record.wikiPath
        ? path.posix.join(folder, `${stem}-${index + 1}.md`)
        : wikiChapterPath(record, options.wikiDir, index);
      contents.push(`- [[${chapter}|${title} — ${i18nChapter(language, index + 1)}]]`);
    }
  } else {
    contents.push(t("catalog.noContents"));
  }
  const related = record.related
    .map((hash) => {
      const relatedTitle = normalizeDisplayText(options.titles?.[hash] || hash);
      const catalogPath = options.catalogPaths?.[hash] || `${hash}.md`;
      const target = /^[a-f0-9]{64}(?:\.md)?$/i.test(catalogPath.trim())
        ? safeLinkTarget(relatedTitle) || "Related book"
        : catalogLinkTarget(catalogPath);
      return `- [[${target}|${relatedTitle}]]`;
    })
    .join("\n");
  const topicsDir = (options.topicsDir || "_catalog/topics").replace(/\/+$/, "");
  const topicLinks = [...new Set([...(record.tags || []), ...(record.categories || []), ...(record.themes || [])])]
    .map((tag) => `- [[${topicsDir}/${slugify(tag)}|${tag}]]`)
    .join("\n");
  const amazon = amazonSearchDestination(record);
  const amazonLabel = language === "de"
    ? amazon.verifiedProduct
      ? `${amazon.marketplace.replace(/^amazon/, "Amazon")}-Produkt`
      : `${amazon.marketplace.replace(/^amazon/, "Amazon")}-Suche (unbestätigt)`
    : amazon.label;
  const amazonUrl = options.amazonUrlTemplate?.includes("{marketplace}")
    ? options.amazonUrlTemplate
      .replace("{marketplace}", amazon.marketplace)
      .replace("{query}", encodeURIComponent(`${title} ${record.author} ${record.isbn}`.trim()))
    : amazon.url;
  const goodreadsUrl = (
    options.goodreadsUrlTemplate || "https://www.goodreads.com/search?q={query}"
  ).replace("{query}", encodeURIComponent(`${title} ${record.author}`));
  return [
    "---",
    "kind: book",
    "book-library-generated: true",
    "cssclasses: [book-library-catalog-note]",
    `aliases: [${quote(title)}]`,
    `title: ${quote(recordTitle)}`,
    `author: ${quote(recordAuthor)}`,
    `format: ${record.format}`,
    `year: ${quote(record.year)}`,
    `language: ${quote(record.language)}`,
    `publisher: ${quote(record.publisher)}`,
    `isbn: ${quote(record.isbn)}`,
    `pages: ${quote(record.pages)}`,
    `source: ${quote(record.source)}`,
    `tags: ${JSON.stringify(record.tags || [])}`,
    `summary: ${quote(summary)}`,
    `rating: ${record.rating || 0}`,
    `ratingsCount: ${record.ratingsCount || 0}`,
    `categories: ${JSON.stringify(record.categories || [])}`,
    `themes: ${JSON.stringify(record.themes || [])}`,
    `reviews: ${JSON.stringify(record.reviews || [])}`,
    `enrichmentSource: ${quote(record.enrichmentSource || "")}`,
    `enrichmentState: ${quote(record.enrichmentState || "")}`,
    `sourceRatings: ${JSON.stringify(record.sourceRatings || [])}`,
    `sourceDescriptions: ${JSON.stringify(record.sourceDescriptions || [])}`,
    `externalIdentities: ${JSON.stringify(record.externalIdentities || [])}`,
    `authorIdentity: ${JSON.stringify(record.authorIdentity || null)}`,
    `authorProfilePath: ${quote(record.authorProfilePath || "")}`,
    `authorSources: ${JSON.stringify(record.authorSources || [])}`,
    `description: ${quote(record.description || "")}`,
    `wikiPath: ${quote(record.wikiPath || "")}`,
    "---",
    "",
    `# ${title}`,
    "",
    authorLink || recordAuthor,
    "",
  ]
    .concat([`## ${language === "de" ? "Cover" : "Cover"}`, "", coverEmbed, ""])
    .concat(renderRatings(record, language, amazonLabel, amazonUrl))
    .concat(renderDescription(record, language))
    .concat(
      summary
        ? ["> **" + t("catalog.synopsis") + "**", "", summary, ""]
        : []
    )
    .concat(["## " + t("catalog.contents"), "", ...contents, ""])
    .concat(
      related
        ? ["## " + t("catalog.relatedBooks"), "", related, ""]
        : []
    )
    .concat(
      topicLinks
        ? ["## " + t("catalog.relatedTopics"), "", topicLinks, ""]
        : []
    )
    .concat([
      "## " + t("catalog.links"),
      "",
      "- [" + t("catalog.goodreads") + "](" + goodreadsUrl + ")",
      "",
      "## " + t("catalog.technicalDetails"),
      "",
      "> [!info]- " + t("catalog.technicalDetails"),
      "> " + (metaLine || (language === "de" ? "Keine technischen Details vorhanden." : "No technical details available.")),
      ">",
      "> **ISBN:** " + (record.isbn || "—") + " · **Publisher:** " + (record.publisher || "—"),
      "",
    ])
    .join("\n");
}

function renderRatings(record: BookRecord, language: Language, amazonLabel: string, amazonUrl: string): string[] {
  const ratings = record.sourceRatings?.length
    ? record.sourceRatings
    : record.rating
      ? [{
        source: record.enrichmentSource || record.source || "unknown",
        url: "",
        locale: record.language,
        checkedAt: "",
        matchConfidence: 0,
        value: record.rating,
        count: record.ratingsCount || 0,
        status: "provider-reported" as const,
      }]
      : [];
  const lines = ratings.map((rating) => {
    const source = humanizeSource(rating.source);
    const sourceText = rating.url ? `[${source}](${rating.url})` : source;
    return `- ${ratingStars(rating.value)} ${rating.value.toFixed(1)}/5 · ${rating.count} · ${sourceText} · ${rating.status}${rating.checkedAt ? ` · ${rating.checkedAt.slice(0, 10)}` : ""}`;
  });
  lines.push(`- [${amazonLabel}](${amazonUrl}) · ${language === "de" ? "Bewertung nicht verfügbar" : "Rating unavailable"} · unverified`);
  return [`## ${language === "de" ? "Bewertungen" : "Ratings"}`, "", ...lines, ""];
}

function renderDescription(record: BookRecord, language: Language): string[] {
  const sourced = record.sourceDescriptions?.find((item) => item.kind === "source" && item.text)
    || record.sourceDescriptions?.find((item) => item.text);
  const text = normalizeDisplayText(sourced?.text || record.description || "");
  const empty = language === "de" ? "Noch keine bestätigte Beschreibung vorhanden." : "No confirmed description is available yet.";
  const label = sourced?.kind === "ai-summary"
    ? (language === "de" ? "AI-Zusammenfassung" : "AI summary")
    : (language === "de" ? "Beschreibung" : "Description");
  const lines = [`## ${label}`, "", text || empty];
  if (sourced?.url) {
    lines.push("", `${language === "de" ? "Quelle" : "Source"}: [${humanizeSource(sourced.source)}](${sourced.url})${sourced.checkedAt ? ` · ${sourced.checkedAt.slice(0, 10)}` : ""}`);
  }
  return [...lines, ""];
}


function i18nChapter(language: Language, number: number): string {
  return language === "de" ? `Kapitel ${number}` : `Chapter ${number}`;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function safeLinkTarget(value: string): string {
  const normalized = safeFilenamePart(value).replace(/\|/g, "");
  return normalized ? truncateFilename(normalized) : "";
}

function readableCatalogFileName(value: string): string {
  const candidate = value.trim();
  if (!candidate || candidate.includes("/") || candidate.includes("\\") || LEGACY_HASH_NOTE.test(candidate)) {
    return "";
  }
  const normalized = safeFilenamePart(candidate.replace(/\.md$/i, ""));
  return normalized ? `${truncateFilename(normalized)}.md` : "";
}

function safeFilenamePart(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/g, "")
    .replace(/[.\s]+$/g, "")
    .trim();
}

function truncateFilename(value: string): string {
  return Array.from(value).slice(0, MAX_CATALOG_FILENAME_LENGTH).join("").trim() || "Ohne Titel";
}

function uniqueCatalogFileName(preferred: string, claimed: Set<string>): string {
  const stem = preferred.replace(/\.md$/i, "");
  let attempt = `${stem}.md`;
  let suffix = 2;
  while (claimed.has(attempt.toLocaleLowerCase())) {
    const ending = ` (${suffix}).md`;
    attempt = `${truncateFilename(stem).slice(0, Math.max(1, MAX_CATALOG_FILENAME_LENGTH - ending.length))}${ending}`;
    suffix += 1;
  }
  return attempt;
}
