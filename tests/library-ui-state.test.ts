import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIBRARY_UI_STATE,
  hasActiveLibraryFilters,
  normalizeLibraryUiState,
  resetLibraryFilters,
} from "../src/library-ui-state";

describe("library UI state", () => {
  it("falls back to safe defaults for invalid persisted values", () => {
    expect(normalizeLibraryUiState({
      libraryMode: "movies",
      formatFilter: "mobi",
      sortKey: "random",
      selectedTag: "  history  ",
      selectedAudiobookCategory: "Business",
      filtersExpanded: "yes",
    })).toEqual({
      ...DEFAULT_LIBRARY_UI_STATE,
      selectedTag: "history",
      selectedAudiobookCategory: "Business",
    });
  });

  it("preserves valid persisted values", () => {
    const value = normalizeLibraryUiState({
      libraryMode: "audiobooks",
      formatFilter: "epub",
      selectedTag: "history",
      selectedAudiobookCategory: "Business",
      sortKey: "author",
      filtersExpanded: true,
    });
    expect(value).toEqual({
      libraryMode: "audiobooks",
      formatFilter: "epub",
      selectedTag: "history",
      selectedAudiobookCategory: "Business",
      sortKey: "author",
      filtersExpanded: true,
    });
  });

  it("detects active filters and resets them without losing view preferences", () => {
    const state = normalizeLibraryUiState({
      libraryMode: "audiobooks",
      formatFilter: "pdf",
      selectedAudiobookCategory: "Business",
      sortKey: "size",
      filtersExpanded: true,
    });
    expect(hasActiveLibraryFilters(state, "AI")).toBe(true);
    resetLibraryFilters(state);
    expect(hasActiveLibraryFilters(state)).toBe(false);
    expect(state.libraryMode).toBe("audiobooks");
    expect(state.sortKey).toBe("size");
    expect(state.filtersExpanded).toBe(true);
  });
});
