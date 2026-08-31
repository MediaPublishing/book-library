import * as fs from "fs";
import * as path from "path";
import type { BookRecord } from "./types";
import type { Language } from "./i18n";
import { catalogLinkTarget, catalogFileName } from "./catalog";
import { slugify } from "./util";
import { BOOK_LIBRARY_GENERATED_MARKER, isBookLibraryOwnedMarkdown } from "./generated-note";

export function bookTopicLinks(record: BookRecord, topicsDir = "_catalog/topics"): string[] {
  const cleanDir = topicsDir.replace(/\/+$/, "");
  return [...new Set([...(record.tags || []), ...(record.categories || []), ...(record.themes || [])])]
    .map((tag) => slugify(tag))
    .filter(Boolean)
    .map((slug) => `${cleanDir}/${slug}.md`);
}

export function writeBookTopicMocs(
  books: BookRecord[],
  topicsDir: string,
  language: Language = "en",
  catalogDir = "_catalog"
): number {
  const groups = new Map<string, { label: string; books: BookRecord[] }>();
  for (const book of books) {
    for (const tag of new Set([...(book.tags || []), ...(book.categories || []), ...(book.themes || [])])) {
      const slug = slugify(tag);
      if (!slug) continue;
      const group = groups.get(slug.toLocaleLowerCase()) || { label: tag, books: [] };
      group.books.push(book);
      groups.set(slug.toLocaleLowerCase(), group);
    }
  }

  fs.mkdirSync(topicsDir, { recursive: true });
  const heading = language === "de" ? "Verwandte Bücher" : "Related books";
  let written = 0;
  for (const [key, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const links = [...group.books]
      .sort((a, b) => a.title.localeCompare(b.title, language))
      .map((book) => `- [[${catalogLinkTarget(catalogFileName(book), catalogDir)}|${book.title}]]`);
    const target = path.join(topicsDir, `${key}.md`);
    if (fs.existsSync(target)) {
      try {
        if (!isBookLibraryOwnedMarkdown(fs.readFileSync(target, "utf8"), "topic")) continue;
      } catch {
        continue;
      }
    }
    const content = [
      "---",
      "kind: topic",
      BOOK_LIBRARY_GENERATED_MARKER,
      "---",
      "",
      `# ${group.label}`,
      "",
      `## ${heading}`,
      "",
      ...links,
      "",
    ].join("\n");
    fs.writeFileSync(target, content, "utf8");
    written += 1;
  }
  return written;
}
