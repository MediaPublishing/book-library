import { describe, expect, it, vi } from "vitest";
import { collapseGeneratedNoteProperties, isGeneratedCatalogNote, isGeneratedCatalogPath } from "../src/catalog-properties";

describe("generated catalog Properties", () => {
  it("erkennt nur direkte generierte Buchnotizen", () => {
    expect(isGeneratedCatalogPath("_catalog/Buch — Autor.md", "_catalog")).toBe(true);
    expect(isGeneratedCatalogPath("_catalog/topics/economics.md", "_catalog")).toBe(false);
    expect(isGeneratedCatalogPath("Notes/Buch.md", "_catalog")).toBe(false);
  });

  it("klappt Properties nur nach einem Ownership-Nachweis ein", async () => {
    const generated = {
      read: vi.fn().mockResolvedValue("---\nkind: book\nbook-library-generated: true\n---\n# Catalog"),
    };
    const userOwned = {
      read: vi.fn().mockResolvedValue("---\nkind: book\n---\n# Meine Buchnotiz"),
    };

    await expect(isGeneratedCatalogNote(generated, "_catalog/Catalog.md", "_catalog")).resolves.toBe(true);
    await expect(isGeneratedCatalogNote(userOwned, "_catalog/Catalog.md", "_catalog")).resolves.toBe(false);
    await expect(isGeneratedCatalogNote(generated, "_catalog/topics/economics.md", "_catalog")).resolves.toBe(false);
    expect(generated.read).toHaveBeenCalledOnce();
  });

  it("klickt den offenen Properties-Schalter höchstens einmal und bleibt sonst ein No-op", () => {
    const click = vi.fn();
    const toggle = { click } as unknown as HTMLElement;
    const container = {
      querySelector: vi.fn((selector: string) => selector.includes("metadata-container") ? toggle : null),
    } as unknown as HTMLElement;

    expect(collapseGeneratedNoteProperties(container)).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(collapseGeneratedNoteProperties({ querySelector: () => null } as unknown as HTMLElement)).toBe(false);
  });
});
