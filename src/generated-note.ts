/**
 * Ownership and collision rules shared by Book Library note writers.
 *
 * A path below `_catalog` is never sufficient evidence that Book Library may
 * replace its contents. The explicit marker is the primary contract; the two
 * legacy signatures only keep existing generated notes usable during the
 * marker migration.
 */
export const BOOK_LIBRARY_GENERATED_MARKER = "book-library-generated: true";
export const BOOK_LIBRARY_MANAGED_START = "<!-- book-library:managed:start -->";
export const BOOK_LIBRARY_MANAGED_END = "<!-- book-library:managed:end -->";

export type BookLibraryGeneratedKind = "book" | "author" | "topic";

export interface MarkdownNoteAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
}

export interface GeneratedNoteTarget {
  /** The safe target to create or open. */
  path: string;
  /** A user-owned path had to be skipped to reach this target. */
  collision: boolean;
  /** The returned target already exists and is proven Book Library-owned. */
  owned: boolean;
}

/**
 * Returns true only for an explicit Book Library marker or a narrow legacy
 * signature that earlier versions of this plugin emitted.
 */
export function isBookLibraryOwnedMarkdown(
  content: string,
  expectedKind?: BookLibraryGeneratedKind
): boolean {
  const frontmatter = readFrontmatter(content);
  if (!frontmatter) return expectedKind === "topic" && isLegacyGeneratedTopic(content);
  const kind = frontmatterValue(frontmatter, "kind");
  if (expectedKind && kind !== expectedKind) return false;

  if (hasTrueMarker(frontmatter)) return kind === "book" || kind === "author" || kind === "topic";
  if (kind === "book") return /(?:^|\n)cssclasses\s*:\s*\[[^\]]*\bbook-library-catalog-note\b[^\]]*\]/i.test(frontmatter);
  return kind === "author" && /(?:^|\n)authorId\s*:\s*(?:"[^"]+"|'[^']+'|[^\s#]+)\s*$/im.test(frontmatter);
}

function isLegacyGeneratedTopic(content: string): boolean {
  return /^# [^\n]+\r?\n\r?\n## (?:Verwandte Bücher|Related books)\r?\n\r?\n(?:- \[\[[^\n]+\]\]\r?\n)*$/u
    .test(content);
}

export function hasBookLibraryManagedBlock(content: string): boolean {
  const start = content.indexOf(BOOK_LIBRARY_MANAGED_START);
  const end = content.indexOf(BOOK_LIBRARY_MANAGED_END);
  return start >= 0 && end > start;
}

/**
 * Replaces only the plugin-owned body of a marked note. All user content
 * outside the managed delimiters, including notes below the generated profile,
 * remains untouched.
 */
export function replaceBookLibraryManagedBlock(content: string, managedBlock: string): string | null {
  const start = content.indexOf(BOOK_LIBRARY_MANAGED_START);
  const end = content.indexOf(BOOK_LIBRARY_MANAGED_END, start + BOOK_LIBRARY_MANAGED_START.length);
  if (start < 0 || end < 0 || end <= start) return null;
  return `${content.slice(0, start)}${managedBlock}${content.slice(end + BOOK_LIBRARY_MANAGED_END.length)}`;
}

/**
 * Finds a safe, deterministic path. A user-owned note is never returned as a
 * generated target. The first reserved alternate uses `(Book Library)` and
 * subsequent collisions are numbered.
 */
export async function resolveGeneratedNoteTarget(
  adapter: MarkdownNoteAdapter,
  preferredPath: string,
  kind: BookLibraryGeneratedKind
): Promise<GeneratedNoteTarget> {
  let attempt = 0;
  let candidate = preferredPath;
  for (;;) {
    if (!await adapter.exists(candidate)) {
      return { path: candidate, collision: attempt > 0, owned: false };
    }
    const content = await adapter.read(candidate);
    if (isBookLibraryOwnedMarkdown(content, kind)) {
      return { path: candidate, collision: attempt > 0, owned: true };
    }
    attempt += 1;
    if (attempt > 999) throw new Error("Unable to reserve a collision-safe Book Library note path");
    candidate = withBookLibrarySuffix(preferredPath, attempt);
  }
}

function readFrontmatter(content: string): string | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match?.[1] ?? null;
}

function frontmatterValue(frontmatter: string, key: string): string {
  const match = frontmatter.match(new RegExp(`(?:^|\\n)${key}\\s*:\\s*(.+?)\\s*$`, "im"));
  return match?.[1]?.replace(/^['"]|['"]$/g, "").trim() || "";
}

function hasTrueMarker(frontmatter: string): boolean {
  return /(?:^|\n)book-library-generated\s*:\s*(?:true|"true"|'true')\s*$/im.test(frontmatter);
}

function withBookLibrarySuffix(filePath: string, attempt: number): string {
  const extension = /\.md$/i.test(filePath) ? ".md" : "";
  const stem = extension ? filePath.slice(0, -extension.length) : filePath;
  const suffix = attempt === 1 ? " (Book Library)" : ` (Book Library ${attempt})`;
  return `${stem}${suffix}${extension}`;
}
