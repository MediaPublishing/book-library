import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { authorProfileId, authorProfileLink, writeAuthorProfiles, writeAuthorProfilesDetailed } from "../src/authors";
import type { BookRecord } from "../src/types";

function book(hash: string, title: string, authorityId: string | null = "OL123A"): BookRecord {
  const record: BookRecord = {
    hash,
    file: `${title}.epub`, format: "epub", size: 1, mtime: 1, cover: "", ingested: "2026-08-29T00:00:00Z",
    title, author: "Michael Hudson", year: "", language: "en", publisher: "", isbn: "", pages: "",
    tags: ["economics"], source: "local", summary: "", related: [], wikiStatus: "none", markdownPath: "",
  };
  if (authorityId) {
    record.authorIdentity = { id: `open-library:${authorityId}`, authorityIds: { "open-library": authorityId }, status: "matched" };
  }
  return record;
}

describe("typed author profiles", () => {
  it("führt zwei Bücher mit derselben Authority-ID in einem nützlichen Profil zusammen", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-authors-"));
    const books = [book("a", "J Is for Junk Economics"), book("b", "...and forgive them their debts")];

    expect(writeAuthorProfiles(books, root, "en", "_catalog")).toBe(1);
    const files = fs.readdirSync(root);
    expect(files).toHaveLength(1);
    const content = fs.readFileSync(path.join(root, files[0]), "utf8");
    expect(content).toContain("# Michael Hudson");
    expect(content).toContain("J Is for Junk Economics");
    expect(content).toContain("and forgive them their debts");
    expect(authorProfileLink(books[0], "_catalog/authors")).toContain("open-library-ol123a");
  });

  it("mischt gleichnamige Autoren mit unterschiedlichen Authority-IDs nicht", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-authors-collision-"));
    expect(writeAuthorProfiles([book("a", "Economics", "OL1A"), book("b", "Medicine", "OL2A")], root)).toBe(2);
  });

  it("trennt gleichnamige lokale Autoren ohne geteilte Werk-, ISBN- oder Dateievidenz", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-authors-local-collision-"));
    const economics = book("a", "Economics", null);
    const medicine = book("b", "Medicine", null);

    expect(authorProfileId(economics)).not.toBe(authorProfileId(medicine));
    expect(writeAuthorProfiles([economics, medicine], root)).toBe(2);
    expect(fs.readdirSync(root)).toHaveLength(2);
  });

  it("bewahrt Notizen ausserhalb des verwalteten Autorenblocks bei einer erneuten Generation", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-authors-preserve-"));
    const record = book("a", "Economics");
    const file = path.join(root, `${authorProfileId(record)}.md`);

    expect(writeAuthorProfiles([record], root)).toBe(1);
    fs.appendFileSync(file, "Meine eigene Einschätzung.\n", "utf8");
    expect(writeAuthorProfiles([{ ...record, title: "Economics (updated)" }], root)).toBe(1);

    const content = fs.readFileSync(file, "utf8");
    expect(content).toContain("Economics (updated)");
    expect(content).toContain("Meine eigene Einschätzung.");
  });

  it("überschreibt keine nutzereigene Datei am generierten Profilpfad", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-authors-user-owned-"));
    const record = book("a", "Economics");
    const file = path.join(root, `${authorProfileId(record)}.md`);
    fs.writeFileSync(file, "# Meine private Autorennotiz\n", "utf8");

    const result = writeAuthorProfilesDetailed([record], root);
    const alternate = path.join(root, `${authorProfileId(record)} (Book Library).md`);

    expect(result.generated).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(result.paths[authorProfileId(record)]).toBe(alternate);
    expect(record.authorProfilePath).toBe(path.basename(alternate));
    expect(fs.readFileSync(file, "utf8")).toBe("# Meine private Autorennotiz\n");
    expect(fs.readFileSync(alternate, "utf8")).toContain("book-library-generated: true");
  });
});
