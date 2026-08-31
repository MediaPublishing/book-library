import { describe, expect, it, vi } from "vitest";
import { openCatalogNote } from "../src/catalog-navigation";
import type { BookRecord } from "../src/types";

describe("catalog note navigation", () => {
  it("opens the exact catalog note in a visible tab without depending on the vault cache", async () => {
    const openLinkText = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue(undefined);
    const read = vi.fn().mockResolvedValue("---\nkind: book\ncssclasses: [book-library-catalog-note]\n---\n# Existing catalog note");
    const exists = vi.fn(async (path: string) => path.startsWith("_catalog/...") || false);
    const book = {
      title: "...and forgive them their debts: Lending, Foreclosure and Redemption",
      author: "Michael Hudson",
      catalogPath: "...and forgive them their debts Lending, Foreclosure and Redemption — Michael Hudson.md",
    } as BookRecord;

    await openCatalogNote({ workspace: { openLinkText }, vault: { adapter: { exists, read }, create } }, book, "_catalog");

    expect(read).toHaveBeenCalledWith("_catalog/...and forgive them their debts Lending, Foreclosure and Redemption — Michael Hudson.md");
    expect(create).toHaveBeenCalledWith(
      "_catalog/and forgive them their debts Lending, Foreclosure and Redemption — Michael Hudson.md",
      "---\nkind: book\ncssclasses: [book-library-catalog-note]\n---\n# Existing catalog note"
    );
    expect(openLinkText).toHaveBeenCalledOnce();
    expect(openLinkText).toHaveBeenCalledWith(
      "_catalog/and forgive them their debts Lending, Foreclosure and Redemption — Michael Hudson",
      "",
      "tab"
    );
  });

  it("creates a missing catalog note through the canonical renderer before opening it", async () => {
    const openLinkText = vi.fn().mockResolvedValue(undefined);
    const leaf = { getViewState: () => ({ state: { file: "_catalog/Created — Author.md" } }) };
    const revealLeaf = vi.fn().mockResolvedValue(undefined);
    const setActiveLeaf = vi.fn();
    const getLeavesOfType = vi.fn().mockReturnValueOnce([]).mockReturnValue([leaf]);
    const create = vi.fn().mockResolvedValue(undefined);
    const exists = vi.fn().mockResolvedValue(false);
    const render = vi.fn().mockReturnValue("---\nkind: book\nbook-library-generated: true\n---\n# Created");
    const book = { title: "Created", author: "Author", catalogPath: "Created — Author.md" } as BookRecord;

    await openCatalogNote(
      { workspace: { openLinkText, getLeavesOfType, revealLeaf, setActiveLeaf }, vault: { adapter: { exists, read: vi.fn() }, create } },
      book,
      "_catalog",
      render
    );

    expect(create).toHaveBeenCalledWith("_catalog/Created — Author.md", "---\nkind: book\nbook-library-generated: true\n---\n# Created");
    expect(openLinkText).toHaveBeenCalledWith("_catalog/Created — Author", "", "tab");
    expect(revealLeaf).toHaveBeenCalledWith(leaf);
    expect(setActiveLeaf).toHaveBeenCalledWith(leaf, { focus: true });
  });

  it("rejects persisted paths that escape the catalog root", async () => {
    const host = {
      workspace: { openLinkText: vi.fn() },
      vault: { adapter: { exists: vi.fn(), read: vi.fn() }, create: vi.fn() },
    };
    const book = { title: "Unsafe", author: "Author", catalogPath: "../Notes/private.md" } as BookRecord;

    await expect(openCatalogNote(host, book, "_catalog", () => "# Unsafe")).rejects.toThrow(/catalog/i);
    expect(host.vault.create).not.toHaveBeenCalled();
    expect(host.workspace.openLinkText).not.toHaveBeenCalled();
  });

  it("supports catalog notes stored at the vault root", async () => {
    const openLinkText = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue(undefined);
    const host = {
      workspace: { openLinkText },
      vault: { adapter: { exists: vi.fn().mockResolvedValue(false), read: vi.fn() }, create },
    };
    const book = { title: "Root Note", author: "Author" } as BookRecord;

    await openCatalogNote(host, book, "", () => "# Root Note");

    expect(create).toHaveBeenCalledWith("Root Note — Author.md", "# Root Note");
    expect(openLinkText).toHaveBeenCalledWith("Root Note — Author", "", "tab");
  });

  it("uses a host-provided visible-tab opener when available", async () => {
    const openNotePath = vi.fn().mockResolvedValue(undefined);
    const openLinkText = vi.fn().mockResolvedValue(undefined);
    const host = {
      openNotePath,
      workspace: { openLinkText },
      vault: {
        adapter: {
          exists: vi.fn().mockResolvedValue(true),
          read: vi.fn().mockResolvedValue("---\nkind: book\nbook-library-generated: true\n---\n# Visible"),
        },
        create: vi.fn(),
      },
    };
    const book = { title: "Visible", author: "Author" } as BookRecord;

    await openCatalogNote(host, book, "_catalog");

    expect(openNotePath).toHaveBeenCalledWith("_catalog/Visible — Author.md");
    expect(openLinkText).not.toHaveBeenCalled();
  });

  it("reserviert einen deterministischen Alternativpfad statt eine nutzereigene Notiz zu öffnen", async () => {
    const openLinkText = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue(undefined);
    const exists = vi.fn(async (filePath: string) => filePath === "_catalog/Unsafe — Author.md");
    const read = vi.fn().mockResolvedValue("# Meine private Notiz\n");
    const render = vi.fn().mockReturnValue("---\nkind: book\nbook-library-generated: true\n---\n# Book Library note");
    const book = { title: "Unsafe", author: "Author" } as BookRecord;

    await openCatalogNote(
      { workspace: { openLinkText }, vault: { adapter: { exists, read }, create } },
      book,
      "_catalog",
      render
    );

    expect(create).toHaveBeenCalledWith(
      "_catalog/Unsafe — Author (Book Library).md",
      "---\nkind: book\nbook-library-generated: true\n---\n# Book Library note"
    );
    expect(book.catalogPath).toBe("Unsafe — Author (Book Library).md");
    expect(openLinkText).toHaveBeenCalledWith("_catalog/Unsafe — Author (Book Library)", "", "tab");
    expect(read).toHaveBeenCalledWith("_catalog/Unsafe — Author.md");
  });

  it("lehnt eine nutzereigene Kollision ohne sicheren Renderer ab", async () => {
    const host = {
      workspace: { openLinkText: vi.fn() },
      vault: {
        adapter: {
          exists: vi.fn((filePath: string) => Promise.resolve(filePath === "_catalog/Unsafe — Author.md")),
          read: vi.fn().mockResolvedValue("# Meine private Notiz\n"),
        },
        create: vi.fn(),
      },
    };
    const book = { title: "Unsafe", author: "Author" } as BookRecord;

    await expect(openCatalogNote(host, book, "_catalog")).rejects.toThrow(/user-owned/i);
    expect(host.vault.create).not.toHaveBeenCalled();
    expect(host.workspace.openLinkText).not.toHaveBeenCalled();
  });
});
