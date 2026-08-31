import type { BookRecord } from "./types";
import { normalizeDisplayText, sha256, slugify } from "./util";

export function authorProfileId(book: BookRecord): string {
  const explicit = normalizeDisplayText(book.authorIdentity?.id || "");
  if (explicit && book.authorIdentity?.status === "matched") return slugify(explicit.replace(/:/g, "-"));
  const name = slugify(book.author || "unknown-author") || "unknown-author";
  return `local-${name}-${localAuthorEvidenceSignature(book)}`;
}

export function authorProfileLink(book: BookRecord, authorsDir = "_catalog/authors"): string {
  const cleanDir = authorsDir.replace(/\/+$/, "");
  const stored = normalizeDisplayText(book.authorProfilePath || "");
  const safeStored = stored && !stored.includes("/") && !stored.includes("\\")
    ? stored.replace(/\.md$/i, "")
    : "";
  return `${cleanDir}/${safeStored || authorProfileId(book)}`;
}

/**
 * A name alone is not an author identity. Use the strongest stable work,
 * ISBN or file evidence available so unrelated people with identical display
 * names cannot silently share a profile.
 */
function localAuthorEvidenceSignature(book: BookRecord): string {
  const work = book.externalIdentities
    ?.map((identity) => {
      const id = normalizeDisplayText(identity.workId || "");
      return id ? `${normalizeDisplayText(identity.source || "source")}:${id}` : "";
    })
    .filter(Boolean)
    .sort()[0];
  const isbn = normalizeIsbn(book.isbn);
  const file = normalizeDisplayText(book.file).replace(/\\/g, "/").toLocaleLowerCase();
  const fallback = normalizeDisplayText(book.hash) || normalizeDisplayText(book.title) || "unknown";
  const evidence = work ? `work:${work}` : isbn ? `isbn:${isbn}` : file ? `file:${file}` : `record:${fallback}`;
  return sha256(evidence).slice(0, 20);
}

function normalizeIsbn(value: string): string {
  return normalizeDisplayText(value).replace(/[^0-9x]/gi, "").toUpperCase();
}
