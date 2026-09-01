import { describe, expect, it } from "vitest";
import { prepareAudiobookLibraryResults, prepareBookLibraryResults } from "../src/library-search";
import type { AudiobookRecord, BookRecord } from "../src/types";

function book(hash: string, title: string, summary = ""): BookRecord {
  return {
    hash,
    file: `${hash}.epub`,
    format: "epub",
    size: 1,
    mtime: 0,
    cover: "",
    ingested: "",
    title,
    author: "",
    year: "",
    language: "en",
    publisher: "",
    isbn: "",
    pages: "",
    tags: ["test"],
    source: "local",
    summary,
    related: [],
    wikiStatus: "none",
    markdownPath: "",
  };
}

function audiobook(id: string, title: string, synopsis = ""): AudiobookRecord {
  return {
    id,
    sourceName: `${id}.m4b`,
    legacyPrivatePath: "",
    mediaType: "audiobook",
    title,
    author: "",
    narrator: "",
    duration: "",
    audioFormats: ["m4b"],
    audioFileCount: 1,
    audioBytes: 1,
    audioLastModified: "",
    language: "en",
    year: "",
    category: ["Business"],
    synopsis,
    synopsisStatus: "inventory-note",
    synopsisSource: "",
    sourceMetadataFiles: [],
    localBookSources: [],
    sourceStatus: "manual",
    metadataStatus: "needs-enrichment",
    matchStatus: "unmatched",
    relatedBooks: [],
    relatedTopicLinks: [],
    cover: "",
    legacyPublicLink: null,
    legacyPrivateUrl: null,
    publicMetadataSources: [],
    catalogPath: "",
  };
}

describe("library semantic search integration", () => {
  it("searches source-backed book metadata and preserves active filters", () => {
    const results = prepareBookLibraryResults([
      book("match", "Focus", "Responsible automation for teams"),
      { ...book("filtered", "Automation"), tags: ["other"] },
      book("none", "Cooking"),
    ], {
      query: "automation",
      formatFilter: "epub",
      selectedTag: "test",
      sortKey: "title",
      language: "en",
    });

    expect(results.map(({ hash }) => hash)).toEqual(["match"]);
  });

  it("uses the same semantic behavior for audiobook synopses and categories", () => {
    const results = prepareAudiobookLibraryResults([
      audiobook("match", "Operations", "A guide to responsible automation."),
      { ...audiobook("filtered", "Automation"), category: ["History"] },
      audiobook("none", "Cooking"),
    ], {
      query: "automation",
      selectedCategory: "Business",
      sortKey: "title",
      language: "en",
    });

    expect(results.map(({ id }) => id)).toEqual(["match"]);
  });
});
