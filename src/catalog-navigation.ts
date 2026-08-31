import { catalogFileName, catalogLinkTarget } from "./catalog";
import { isBookLibraryOwnedMarkdown, resolveGeneratedNoteTarget } from "./generated-note";
import type { BookRecord } from "./types";

interface CatalogNoteHost {
  openNotePath?(notePath: string): Promise<void>;
  workspace: {
    openLinkText(
      linktext: string,
      sourcePath: string,
      newLeaf?: "tab" | "split" | "window" | boolean
    ): Promise<void>;
    getLeavesOfType?(type: string): Array<{
      getViewState(): { state?: { file?: string } };
    }>;
    revealLeaf?(leaf: { getViewState(): { state?: { file?: string } } }): Promise<void>;
    setActiveLeaf?(leaf: { getViewState(): { state?: { file?: string } } }, params?: { focus?: boolean }): void;
  };
  vault: {
    adapter: {
      exists(path: string): Promise<boolean>;
      read(path: string): Promise<string>;
    };
    create(path: string, data: string): Promise<unknown>;
  };
}

export async function openCatalogNote(
  host: CatalogNoteHost,
  book: BookRecord,
  catalogDir: string,
  render?: (book: BookRecord) => string
): Promise<void> {
  const directory = catalogDir.replace(/^\/+|\/+$/g, "");
  if (directory.includes("..") || directory.includes("\\")) {
    throw new Error("Invalid catalog root");
  }
  if (book.catalogPath && (book.catalogPath.includes("/") || book.catalogPath.includes("\\"))) {
    throw new Error("Catalog path escapes the configured root");
  }
  const preferredFilename = catalogFileName(book);
  const preferredPath = directory ? `${directory}/${preferredFilename}` : preferredFilename;
  const legacyFilename = (book.catalogPath || "").split(/[\\/]/).at(-1) || "";
  const legacyPath = directory && legacyFilename ? `${directory}/${legacyFilename}` : legacyFilename;
  const resolved = await resolveGeneratedNoteTarget(host.vault.adapter, preferredPath, "book");
  const notePath = resolved.path;
  const filename = catalogFilenameFromPath(notePath, directory);
  let ensured = resolved.owned;
  if (ensured || resolved.collision) book.catalogPath = filename;

  if (
    legacyPath &&
    legacyPath !== notePath &&
    await host.vault.adapter.exists(legacyPath) &&
    !ensured
  ) {
    const content = await host.vault.adapter.read(legacyPath);
    if (isBookLibraryOwnedMarkdown(content, "book")) {
      await host.vault.create(notePath, content);
      book.catalogPath = filename;
      ensured = true;
    }
  }

  if (!ensured) {
    if (!render) {
      if (resolved.collision) throw new Error("Catalog note path is occupied by a user-owned note");
      throw new Error("Catalog note is missing and no renderer was supplied");
    }
    const content = render(book);
    if (!content.trim()) throw new Error("Catalog renderer returned empty content");
    await host.vault.create(notePath, content);
    book.catalogPath = filename;
    ensured = true;
  }

  const target = catalogLinkTarget(filename, directory);
  if (host.openNotePath) {
    await host.openNotePath(notePath);
    return;
  }
  const findOpenedLeaf = () => host.workspace.getLeavesOfType?.("markdown")
    .find((leaf) => leaf.getViewState().state?.file === notePath);
  let openedLeaf = findOpenedLeaf();
  if (!openedLeaf) {
    await host.workspace.openLinkText(target, "", "tab");
    openedLeaf = findOpenedLeaf();
  }
  if (openedLeaf) {
    if (host.workspace.revealLeaf) await host.workspace.revealLeaf(openedLeaf);
    host.workspace.setActiveLeaf?.(openedLeaf, { focus: true });
  }
}

function catalogFilenameFromPath(notePath: string, directory: string): string {
  if (!directory) return notePath;
  const prefix = `${directory}/`;
  if (!notePath.startsWith(prefix)) throw new Error("Catalog target escapes the configured root");
  return notePath.slice(prefix.length);
}
