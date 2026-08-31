import { createHash } from "crypto";
import * as path from "path";

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function mergeByKey<T>(existing: T[], incoming: T[], key: (value: T) => string): T[] {
  const merged = new Map(existing.map((value) => [key(value), value]));
  for (const value of incoming) merged.set(key(value), value);
  return [...merged.values()];
}

export function uniqueNormalizedStrings(values: string[]): string[] {
  return [...new Set(values.map(normalizeDisplayText).filter(Boolean))];
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

export function normalizeQuery(value: string): string {
  return value.toLowerCase().normalize("NFKC").trim();
}

export function estimateTokens(text: string): number {
  // Heuristik: 4 Zeichen pro Token; für europäische Prosa konservativ.
  return Math.max(1, Math.ceil(text.length / 4));
}

export function chunkText(text: string, maxTokens: number, minChars = 800): string[] {
  const maxChars = maxTokens * 4;
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    let cut = Math.min(rest.length, maxChars);
    if (cut < rest.length && cut > minChars) {
      const boundary = rest.lastIndexOf("\n\n", cut);
      const boundarySingle = rest.lastIndexOf("\n", cut);
      const chosen = boundary > minChars ? boundary : boundarySingle > minChars ? boundarySingle : cut;
      cut = chosen;
    }
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut);
  }
  return chunks.filter((c) => c.length > 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  deg: "°",
  eacute: "é",
  egrave: "è",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  szlig: "ß",
};

/**
 * Metadata often arrives XML-encoded, double-encoded or read through the
 * wrong PDF codec. Normalize it once so catalog notes and UI cards show the
 * same readable text.
 */
export function normalizeDisplayText(value: string | undefined): string {
  if (!value) return "";
  let text = value;

  // Repair UTF-8 bytes that were decoded as Latin-1 by a PDF extractor.
  if (/[\u00c2-\u00f4][\u0080-\u00bf]/.test(text)) {
    try {
      const decoded = Buffer.from(text, "latin1").toString("utf8");
      if (decoded && !decoded.includes("\uFFFD")) text = decoded;
    } catch {
      // Keep the original if the payload is not recoverable as UTF-8.
    }
  }

  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = text.replace(/&([a-z]+|#x?[0-9a-f]+);/gi, (entity, body: string) => {
      if (body.startsWith("#x") || body.startsWith("#X")) {
        const code = Number.parseInt(body.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
      }
      if (body.startsWith("#")) {
        const code = Number.parseInt(body.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
    });
    if (decoded === text) break;
    text = decoded;
  }

  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u00ad\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?)\]])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .replace(/\s*;\s*/g, "; ")
    .trim();
}

export function normalizeMatchKey(value: string): string {
  return normalizeDisplayText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function ratingStars(value: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(value)));
  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
}

export function humanizeSource(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function initials(value: string): string {
  const parts = value
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((part) => part.length > 0);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + second).toUpperCase();
}

export function colorForString(value: string): string {
  // Initials carry the identity. A neutral theme background keeps placeholder
  // text legible across light, dark, and high-contrast Obsidian themes.
  const palette = [
    "var(--background-secondary)",
    "var(--background-modifier-hover)",
  ];
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

export type SortKey = "title" | "author" | "year" | "size" | "newest" | "genre";

const collators = new Map<string, Intl.Collator>();

function collator(language: string): Intl.Collator {
  let result = collators.get(language);
  if (!result) {
    result = new Intl.Collator(language, { sensitivity: "base", numeric: true });
    collators.set(language, result);
  }
  return result;
}

export function sortBooks<
  T extends { title: string; author: string; year: string; size: number; mtime: number; tags?: string[] }
>(
  books: T[],
  sortKey: SortKey,
  language = "en"
): T[] {
  const compare = collator(language);
  const sorted = [...books];
  switch (sortKey) {
    case "author":
      sorted.sort((a, b) => compare.compare(a.author || "", b.author || "") || compare.compare(a.title, b.title));
      break;
    case "year":
      sorted.sort((a, b) => yearNumber(b.year) - yearNumber(a.year) || compare.compare(a.title, b.title));
      break;
    case "size":
      sorted.sort((a, b) => b.size - a.size || compare.compare(a.title, b.title));
      break;
    case "newest":
      sorted.sort((a, b) => b.mtime - a.mtime || compare.compare(a.title, b.title));
      break;
    case "genre":
      sorted.sort((a, b) => compare.compare(genreOf(a), genreOf(b)) || compare.compare(a.title, b.title));
      break;
    default:
      sorted.sort((a, b) => compare.compare(a.title, b.title) || compare.compare(a.author || "", b.author || ""));
  }
  return sorted;
}

export function sortAudiobooks<
  T extends {
    id: string;
    title: string;
    author: string;
    year: string;
    audioBytes: number;
    audioLastModified: string;
    category?: string[];
  }
>(
  audiobooks: T[],
  sortKey: SortKey,
  language = "en"
): T[] {
  const compare = collator(language);
  const sorted = [...audiobooks];
  const newest = (value: T): number => {
    const parsed = Date.parse(value.audioLastModified);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  switch (sortKey) {
    case "author":
      sorted.sort((a, b) => compare.compare(a.author || "", b.author || "") || compare.compare(a.title, b.title));
      break;
    case "year":
      sorted.sort((a, b) => yearNumber(b.year) - yearNumber(a.year) || compare.compare(a.title, b.title));
      break;
    case "size":
      sorted.sort((a, b) => b.audioBytes - a.audioBytes || compare.compare(a.title, b.title));
      break;
    case "newest":
      sorted.sort((a, b) => newest(b) - newest(a) || compare.compare(a.title, b.title));
      break;
    case "genre":
      sorted.sort((a, b) => compare.compare(a.category?.[0] || "", b.category?.[0] || "") || compare.compare(a.title, b.title));
      break;
    default:
      sorted.sort((a, b) =>
        compare.compare(a.title, b.title) ||
        compare.compare(a.author || "", b.author || "") ||
        a.id.localeCompare(b.id)
      );
  }
  return sorted;
}

export function genreOf<T extends { tags?: string[] }>(value: T): string {
  return value.tags?.[0] || "unknown";
}

export function wikiFolderPath(value: { title: string; hash: string }, wikiDir: string): string {
  return path.posix.join(wikiDir || "_wiki", slugify(value.title) || value.hash);
}

export function wikiMainPath(value: { title: string; hash: string }, wikiDir: string): string {
  return path.posix.join(wikiFolderPath(value, wikiDir), `${slugify(value.title) || value.hash}.md`);
}

export function wikiChapterPath(
  value: { title: string; hash: string },
  wikiDir: string,
  index: number
): string {
  return path.posix.join(
    wikiFolderPath(value, wikiDir),
    `${slugify(value.title) || value.hash}-${index + 1}.md`
  );
}

function yearNumber(value: string): number {
  const match = value.match(/\d{4}/);
  return match ? Number(match[0]) : 0;
}
