import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { archiveReplacedCatalogNotes } from "../src/catalog-maintenance";

describe("catalog maintenance ownership", () => {
  it("archiviert keine nutzereigene Notiz bei einer Pfadmigration", () => {
    const catalogDir = fs.mkdtempSync(path.join(os.tmpdir(), "book-library-maintenance-"));
    const userNote = path.join(catalogDir, "Eigene Notiz.md");
    fs.writeFileSync(userNote, "# Eigene Notiz\n\nNicht vom Plugin verwaltet.\n", "utf8");

    const archived = archiveReplacedCatalogNotes(catalogDir, [{
      hash: "user-note",
      from: "Eigene Notiz.md",
      to: "Neuer Name.md",
    }]);

    expect(archived).toBe(0);
    expect(fs.readFileSync(userNote, "utf8")).toContain("Nicht vom Plugin verwaltet");
  });

  it("archiviert eine eindeutig generierte Vorgängernotiz", () => {
    const catalogDir = fs.mkdtempSync(path.join(os.tmpdir(), "book-library-maintenance-"));
    const generated = path.join(catalogDir, "Alt.md");
    fs.writeFileSync(generated, [
      "---",
      "kind: book",
      "book-library-generated: true",
      "---",
      "",
      "# Alt",
    ].join("\n"), "utf8");

    const archived = archiveReplacedCatalogNotes(catalogDir, [{
      hash: "generated-note",
      from: "Alt.md",
      to: "Neu.md",
    }]);

    expect(archived).toBe(1);
    expect(fs.existsSync(generated)).toBe(false);
  });
});
