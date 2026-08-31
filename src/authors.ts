import * as fs from "fs";
import * as path from "path";
import { catalogFileName, catalogLinkTarget } from "./catalog";
import type { Language } from "./i18n";
import type { AuthorSourceRecord, BookRecord } from "./types";
import { humanizeSource, normalizeDisplayText, slugify } from "./util";
import { authorProfileId, authorProfileLink } from "./author-id";
import {
  BOOK_LIBRARY_GENERATED_MARKER,
  BOOK_LIBRARY_MANAGED_END,
  BOOK_LIBRARY_MANAGED_START,
  hasBookLibraryManagedBlock,
  isBookLibraryOwnedMarkdown,
  replaceBookLibraryManagedBlock,
} from "./generated-note";

export { authorProfileId, authorProfileLink } from "./author-id";

export interface AuthorProfileWriteResult {
  /** Profiles that are generated or already safely up to date. */
  generated: number;
  /** Existing user-owned or legacy-unstructured paths left untouched. */
  skipped: string[];
  /** Resolvable absolute paths by stable author profile ID. */
  paths: Record<string, string>;
}

export function writeAuthorProfiles(
  books: BookRecord[],
  authorsDir: string,
  language: Language = "en",
  catalogDir = "_catalog"
): number {
  return writeAuthorProfilesDetailed(books, authorsDir, language, catalogDir).generated;
}

/**
 * Safely writes the managed part of generated author profiles. Existing
 * unmarked notes, and earlier unstructured author profiles that might contain
 * manual edits, are deliberately skipped rather than overwritten.
 */
export function writeAuthorProfilesDetailed(
  books: BookRecord[],
  authorsDir: string,
  language: Language = "en",
  catalogDir = "_catalog"
): AuthorProfileWriteResult {
  const groups = new Map<string, BookRecord[]>();
  for (const book of books) {
    if (!normalizeDisplayText(book.author)) continue;
    const id = authorProfileId(book);
    const group = groups.get(id) || [];
    group.push(book);
    groups.set(id, group);
  }

  fs.mkdirSync(authorsDir, { recursive: true });
  const result: AuthorProfileWriteResult = { generated: 0, skipped: [], paths: {} };
  for (const [id, group] of groups) {
    const filePath = resolveAuthorProfileTarget(authorsDir, id);
    const profileFile = path.basename(filePath);
    for (const book of group) book.authorProfilePath = profileFile;
    const rendered = renderAuthorProfile(id, group, language, catalogDir);
    result.paths[id] = filePath;
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, rendered, "utf8");
      result.generated += 1;
      continue;
    }

    let existing: string;
    try {
      existing = fs.readFileSync(filePath, "utf8");
    } catch {
      result.skipped.push(filePath);
      continue;
    }
    if (!isBookLibraryOwnedMarkdown(existing, "author") || !hasBookLibraryManagedBlock(existing)) {
      result.skipped.push(filePath);
      continue;
    }
    const managed = managedAuthorBlock(id, group, language, catalogDir);
    const next = replaceBookLibraryManagedBlock(existing, managed);
    if (next === null) {
      result.skipped.push(filePath);
      continue;
    }
    if (next !== existing) fs.writeFileSync(filePath, next, "utf8");
    result.generated += 1;
  }
  return result;
}

function resolveAuthorProfileTarget(authorsDir: string, id: string): string {
  const preferred = path.join(authorsDir, `${id}.md`);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = attempt === 0 ? "" : attempt === 1 ? " (Book Library)" : ` (Book Library ${attempt})`;
    const candidate = attempt === 0 ? preferred : path.join(authorsDir, `${id}${suffix}.md`);
    if (!fs.existsSync(candidate)) return candidate;
    try {
      const content = fs.readFileSync(candidate, "utf8");
      if (isBookLibraryOwnedMarkdown(content, "author") && hasBookLibraryManagedBlock(content)) return candidate;
    } catch {
      // Unreadable or unstructured notes remain user-owned; try a suffix.
    }
  }
  throw new Error(`Unable to reserve author profile path for ${id}`);
}

function renderAuthorProfile(id: string, group: BookRecord[], language: Language, catalogDir: string): string {
  const sorted = [...group].sort((a, b) => a.title.localeCompare(b.title, language));
  const author = normalizeDisplayText(sorted[0].author);
  const identityStatus = sorted[0].authorIdentity?.status || "local-name-match";
  return [
    "---",
    "kind: author",
    BOOK_LIBRARY_GENERATED_MARKER,
    `authorId: ${JSON.stringify(id)}`,
    `identityStatus: ${JSON.stringify(identityStatus)}`,
    `aliases: [${JSON.stringify(author)}]`,
    "---",
    "",
    managedAuthorBlock(id, group, language, catalogDir),
    "",
    `## ${language === "de" ? "Eigene Notizen" : "Your notes"}`,
    "",
  ].join("\n");
}

function managedAuthorBlock(id: string, group: BookRecord[], language: Language, catalogDir: string): string {
  const sorted = [...group].sort((a, b) => a.title.localeCompare(b.title, language));
  const author = normalizeDisplayText(sorted[0].author);
  const identityStatus = sorted[0].authorIdentity?.status || "local-name-match";
  const sources = uniqueSources(sorted.flatMap((book) => book.authorSources || []));
  const biography = sources.find((source) => source.kind === "biography" && normalizeDisplayText(source.text || ""));
  const works = [...new Set(sources.flatMap((source) => source.works || []).map(normalizeDisplayText).filter(Boolean))];
  const topics = [...new Set(sorted.flatMap((book) => [...book.tags, ...(book.categories || []), ...(book.themes || [])]))]
    .map(normalizeDisplayText)
    .filter(Boolean);
  const localBooks = sorted.map((book) => `- [[${catalogLinkTarget(catalogFileName(book), catalogDir)}|${book.title}]]`);
  const topicDir = `${catalogDir.replace(/\/+$/, "")}/topics`;
  const lines = [
    BOOK_LIBRARY_MANAGED_START,
    `# ${author}`,
    "",
    `> ${identityStatus === "matched"
      ? (language === "de" ? "Autoridentität über eine externe Authority-ID bestätigt." : "Author identity matched through an external authority ID.")
      : (language === "de" ? "Lokales Profil mit klar abgegrenzter Evidenz; externe Identität noch nicht bestätigt." : "Local profile with deliberately limited evidence; external identity is not confirmed yet.")}`,
    "",
    `## ${language === "de" ? "Kurzbiografie" : "Biography"}`,
    "",
    biography?.text
      ? normalizeDisplayText(biography.text)
      : (language === "de" ? "Noch keine bestätigte biografische Quelle vorhanden." : "No confirmed biographical source is available yet."),
    ...(biography ? ["", `${language === "de" ? "Quelle" : "Source"}: [${humanizeSource(biography.source)}](${biography.url}) · ${biography.checkedAt}`] : []),
    "",
    `## ${language === "de" ? "Bücher in dieser Bibliothek" : "Books in this library"}`,
    "",
    ...localBooks,
    "",
    `## ${language === "de" ? "Verwandte Themen" : "Related topics"}`,
    "",
    ...(topics.length
      ? topics.map((topic) => `- [[${topicDir}/${slugify(topic)}|${topic}]]`)
      : [language === "de" ? "Noch keine Themen erfasst." : "No topics captured yet."]),
    "",
    `## ${language === "de" ? "Weitere Werke" : "Selected other works"}`,
    "",
    ...(works.length ? works.map((work) => `- ${work}`) : [language === "de" ? "Noch keine bestätigten weiteren Werke erfasst." : "No confirmed additional works captured yet."]),
    "",
    `## ${language === "de" ? "Quellen" : "Sources"}`,
    "",
    ...(sources.length
      ? sources.map((source) => `- [${humanizeSource(source.source)}](${source.url}) · ${source.checkedAt}`)
      : [language === "de" ? "Noch keine externen Quellen bestätigt." : "No external sources confirmed yet."]),
    "",
    BOOK_LIBRARY_MANAGED_END,
  ];
  return lines.join("\n");
}

function uniqueSources(sources: AuthorSourceRecord[]): AuthorSourceRecord[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.kind}\u0000${source.url}`;
    if (!source.url || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
