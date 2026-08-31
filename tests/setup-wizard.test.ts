import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSetupSummary,
  classifyBookScanStatus,
  isReadableDirectory,
  normalizeScanResult,
  resolveScanResult,
} from "../src/setup-wizard-modal";

describe("setup wizard summary", () => {
  it("combines book and audiobook completion without leaking technical IDs", () => {
    const summary = buildSetupSummary(
      [
        { cover: "book.png", related: ["other"] },
        { cover: "", related: [] },
      ],
      [
        { cover: "audio.png", sourceLink: null, relatedTopicLinks: ["topics/ai.md"] },
        { cover: "", sourceLink: null, relatedTopicLinks: [] },
        { cover: "", legacyPrivateUrl: "https://example.test/audio", relatedTopicLinks: [] },
      ]
    );
    expect(summary).toEqual({
      books: 2,
      booksWithCovers: 1,
      audiobooks: 3,
      audiobooksWithCovers: 1,
      sourceLinks: 1,
      relatedTopics: 2,
    });
  });
});

describe("setup wizard validation and scan contract", () => {
  it("accepts readable directories and rejects files or missing paths", () => {
    const root = mkdtempSync(join(tmpdir(), "book-library-setup-"));
    const file = join(root, "books.epub");
    writeFileSync(file, "fixture");
    try {
      expect(isReadableDirectory(root)).toBe(true);
      expect(isReadableDirectory(file)).toBe(false);
      expect(isReadableDirectory(join(root, "missing"))).toBe(false);
      expect(isReadableDirectory("  ")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prefers explicit callback outcomes over legacy void returns", () => {
    expect(resolveScanResult(undefined, { status: "partial", indexed: 2 })).toEqual({ status: "partial", indexed: 2 });
    expect(resolveScanResult({ status: "failed", error: "boom" }, { status: "success" })).toEqual({ status: "success" });
    expect(resolveScanResult(undefined, undefined)).toEqual({ status: "success" });
  });

  it("normalizes malformed or textual scan outcomes to a visible failure", () => {
    expect(normalizeScanResult("failed")).toEqual({ status: "failed" });
    expect(normalizeScanResult("network unavailable")).toEqual({ status: "failed", error: "network unavailable" });
    expect(normalizeScanResult({ message: "skipped by platform" })).toEqual({ status: "failed", error: "skipped by platform", message: "skipped by platform" });
    expect(normalizeScanResult(false)).toEqual({ status: "failed" });
  });

  it("reports incomplete and ambiguous book scans instead of false success", () => {
    expect(classifyBookScanStatus(1, ["success"])).toBe("partial");
    expect(classifyBookScanStatus(0, ["success", "failed"])).toBe("partial");
    expect(classifyBookScanStatus(0, ["ambiguous"])).toBe("ambiguous");
    expect(classifyBookScanStatus(0, ["success", undefined])).toBe("success");
  });
});
