import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { conciseDetailSource, detailRatingPresentations, detailSectionOrder, resolveAudiobookDetailRecord, shouldRenderPublicReviews } from "../src/media-detail-modal";
import type { AudiobookRecord, BookRecord } from "../src/types";

describe("public-review visibility", () => {
  it("shows an honest localized Amazon fallback when no rating source exists", () => {
    const record = {
      title: "J Is for Junk Economics", author: "Michael Hudson", language: "en", isbn: "",
      externalIdentities: [{ source: "amazon", url: "https://www.amazon.com/dp/B071W31MTM", locale: "en-US", checkedAt: "2026-08-29", matchConfidence: 1, editionId: "B071W31MTM" }],
    } as unknown as BookRecord;
    expect(detailRatingPresentations(record)).toEqual([expect.objectContaining({
      unavailable: true,
      source: "Amazon.com product",
      url: "https://www.amazon.com/dp/B071W31MTM",
      status: "unverified",
    })]);
  });

  it("shows locally indexed reviews only when product mode and the explicit setting are both enabled", () => {
    expect(shouldRenderPublicReviews("product", true, false)).toBe(true);
    expect(shouldRenderPublicReviews("product", false, false)).toBe(false);
    expect(shouldRenderPublicReviews(undefined, false, false)).toBe(false);
  });

  it("keeps the Amazon rating state visible beside a provider rating", () => {
    const record = {
      title: "Test", author: "Autor", language: "de", isbn: "",
      sourceRatings: [{
        source: "google-books", url: "https://books.google.com/test", locale: "de",
        checkedAt: "2026-08-30", matchConfidence: 1, value: 4.4, count: 12,
        status: "provider-reported",
      }],
    } as unknown as BookRecord;
    const ratings = detailRatingPresentations(record);
    expect(ratings).toHaveLength(2);
    expect(ratings[0]).toMatchObject({ source: "google-books", unavailable: false });
    expect(ratings[1]).toMatchObject({ status: "unverified", unavailable: true });
  });

  it("never shows public reviews in minimal mode, but allows sourced audiobook reviews in product mode", () => {
    expect(shouldRenderPublicReviews("minimal", true, false)).toBe(false);
    expect(shouldRenderPublicReviews("product", true, true)).toBe(true);
  });

  it("uses native audiobook enrichment before a matched ebook fallback", () => {
    const audiobook = {
      title: "Native Audio",
      author: "Audio Author",
      language: "en",
      description: "Description from the audiobook record.",
      rating: 4.8,
      ratingsCount: 81,
      category: ["Audiobooks", "Technology"],
      reviews: [{ source: "library", author: "Listener", rating: 5, text: "Excellent narration." }],
      sourceRatings: [{
        source: "audio-provider", url: "https://example.test/audio", locale: "en",
        checkedAt: "2026-08-31", matchConfidence: 1, value: 4.8, count: 81,
        status: "provider-reported",
      }],
    } as AudiobookRecord;
    const matchedBook = {
      title: "Matched Ebook", author: "Audio Author", language: "en", isbn: "",
      description: "Fallback ebook description.", rating: 3.2, ratingsCount: 4,
      categories: ["Fallback"], reviews: [],
      sourceRatings: [{
        source: "ebook-provider", url: "https://example.test/ebook", locale: "en",
        checkedAt: "2026-08-31", matchConfidence: 1, value: 3.2, count: 4,
        status: "provider-reported",
      }],
      sourceDescriptions: [{
        source: "ebook-provider", url: "https://example.test/ebook", locale: "en",
        checkedAt: "2026-08-31", matchConfidence: 1, text: "Fallback ebook description.", kind: "source",
      }],
    } as unknown as BookRecord;

    const resolved = resolveAudiobookDetailRecord(audiobook, matchedBook);
    expect(resolved.description).toBe("Description from the audiobook record.");
    expect(resolved.rating).toBe(4.8);
    expect(resolved.sourceRatings?.[0].source).toBe("audio-provider");
    expect(resolved.sourceDescriptions).toEqual([]);
    expect(resolved.reviews?.[0].text).toBe("Excellent narration.");
    expect(resolved.categories).toEqual(["Technology"]);
  });

  it("falls back field-by-field when native audiobook enrichment is missing", () => {
    const audiobook = {
      title: "Unmatched Audio", author: "Known Author", language: "de",
      category: ["Audiobooks"],
    } as AudiobookRecord;
    const matchedBook = {
      title: "Book", author: "Known Author", language: "de", isbn: "",
      description: "Buchbeschreibung", rating: 4.1, ratingsCount: 9,
      categories: ["Geschichte"], themes: ["Erinnerung"],
    } as unknown as BookRecord;

    expect(resolveAudiobookDetailRecord(audiobook, matchedBook)).toMatchObject({
      title: "Unmatched Audio",
      description: "Buchbeschreibung",
      rating: 4.1,
      categories: ["Geschichte"],
      themes: ["Erinnerung"],
    });
  });

  it("puts reader-facing sections before related items and technical metadata", () => {
    expect(detailSectionOrder(true)).toEqual(["why-read", "reviews", "related", "technical"]);
    expect(detailSectionOrder(false)).toEqual(["glance", "related", "technical"]);
  });

  it("keeps verbose provenance readable in the compact reader view", () => {
    expect(conciseDetailSource("Lokales EPUB Inhaltsverzeichnis, ohne Netzabruf ausgewertet 2026 08 21"))
      .toBe("Lokales EPUB Inhaltsverzeichnis");
    expect(conciseDetailSource("A very long provider description that is deliberately much longer than the reader view can display"))
      .toMatch(/…$/);
  });

  it("keeps long titles and the related carousel inside the modal width", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../styles.css"), "utf8");
    expect(css).toMatch(/\.book-library-modal\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*hidden/s);
    expect(css).toMatch(/\.book-library-modal-title-box\s*\{[^}]*flex:\s*1 1 0[^}]*max-width:\s*100%/s);
    expect(css).toMatch(/\.book-library-related-list\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%/s);
    expect(css).toMatch(/\.book-library-modal-body > \*\s*\{[^}]*flex:\s*0 0 auto/s);
    expect(css).toMatch(/\.book-library-modal-stars\s*\{[^}]*white-space:\s*nowrap/s);
    expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.book-library-modal-body\s*\{[^}]*max-height:\s*none/s);
    expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*?\.book-library-modal-actions\s*\{[^}]*flex-wrap:\s*nowrap/s);
    expect(css).not.toMatch(/\.book-library-related-item:hover \.book-library-related-cover[\s\S]*scale\(/);
  });

  it("does not restore stale modal focus after navigation actions", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../src/media-detail-modal.ts"), "utf8");
    expect(source).toMatch(/private finish\(action: \(\) => void\): void \{\s*this\.restoreFocusOnClose = false;\s*this\.close\(\);\s*action\(\);/s);
    expect(source).toMatch(/if \(this\.restoreFocusOnClose\) this\.previousActiveElement\?\.focus\(\);/);
  });

  it("renders related records as semantic articles with explicit actions", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../src/media-detail-modal.ts"), "utf8");
    expect(source).toMatch(/createEl\("article", \{ cls: "book-library-related-item" \}\)/);
    expect(source).toMatch(/book-library-related-open/);
    expect(source).not.toMatch(/role: "button"/);
    expect(source).not.toMatch(/attr: \{ role: "button", tabindex: "0" \}/);
  });

  it("shows provenance for ratings, themes, reviews, and descriptions", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../src/media-detail-modal.ts"), "utf8");
    expect(source).toMatch(/humanizeSource\(rating\.status\)/);
    expect(source).toMatch(/const reasonSource = reasons\.length/);
    expect(source).toMatch(/humanizeSource\(review\.source\)/);
    expect(source).toMatch(/humanizeSource\(sourced\.source\)/);
  });

  it("prefers native audiobook presentation data and keeps the matched book as fallback", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../src/media-detail-modal.ts"), "utf8");
    expect(source).toMatch(/const matchedBook = audiobook \? this\.matchedBookFor\(audioRecord\) : undefined/);
    expect(source).toMatch(/const authorProfileBook = audiobook \? matchedBook : bookRecord/);
    expect(source).toMatch(/resolveAudiobookDetailRecord/);
    expect(source).toMatch(/this\.t\(audiobook \? "view\.whyListen" : "view\.whyRead"\)/);
    expect(source).toMatch(/private matchedBookFor\(record: AudiobookRecord\)/);
    expect(source).toMatch(/this\.relatedSection\(parent, this\.t\("catalog\.relatedTopics"\)\)/);
  });

  it("uses Obsidian theme tokens instead of fixed rainbow colors", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../styles.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(css).not.toMatch(/rgba\(/);
    expect(css).toMatch(/\.book-library-modal-actions\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(css).toMatch(/\.book-library-related-list\s*\{[^}]*overflow-y:\s*hidden/s);
  });
});
