import { isBookLibraryOwnedMarkdown, type MarkdownNoteAdapter } from "./generated-note";

export function isGeneratedCatalogPath(filePath: string, catalogDir: string): boolean {
  const root = catalogDir.replace(/^\/+|\/+$/g, "");
  const normalized = filePath.replace(/^\/+/, "");
  if (!root || !normalized.startsWith(`${root}/`) || !normalized.endsWith(".md")) return false;
  const relative = normalized.slice(root.length + 1);
  return relative.length > 3 && !relative.includes("/");
}

/**
 * A direct child of the catalog folder is merely eligible. Properties are
 * collapsed only after its markdown proves Book Library ownership.
 */
export async function isGeneratedCatalogNote(
  adapter: Pick<MarkdownNoteAdapter, "read">,
  filePath: string,
  catalogDir: string
): Promise<boolean> {
  if (!isGeneratedCatalogPath(filePath, catalogDir)) return false;
  try {
    return isBookLibraryOwnedMarkdown(await adapter.read(filePath), "book");
  } catch {
    return false;
  }
}

export function collapseGeneratedNoteProperties(container: HTMLElement): boolean {
  const toggle = container.querySelector<HTMLElement>(
    ".metadata-container:not(.is-collapsed) .metadata-properties-heading, " +
    ".metadata-container:not(.is-collapsed) .collapse-indicator"
  );
  if (!toggle) return false;
  toggle.click();
  return true;
}
