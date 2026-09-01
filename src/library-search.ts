import type { AudiobookRecord, BookRecord } from "./types";
import type { Language } from "./i18n";
import { rankSemanticSearch } from "./semantic-search";
import { sortAudiobooks, sortBooks, type SortKey } from "./util";

export interface BookLibrarySearchState {
  query: string;
  formatFilter: "all" | "epub" | "pdf";
  selectedTag: string;
  sortKey: SortKey;
  language: Language;
}

export interface AudiobookLibrarySearchState {
  query: string;
  selectedCategory: string;
  sortKey: SortKey;
  language: Language;
}

/** Pure search/filter behavior shared by the Obsidian view and its tests. */
export function prepareBookLibraryResults(
  books: readonly BookRecord[],
  state: BookLibrarySearchState,
): BookRecord[] {
  const filtered = books.filter((book) => {
    if (state.formatFilter !== "all" && book.format !== state.formatFilter) return false;
    if (state.selectedTag && !book.tags.includes(state.selectedTag)) return false;
    return true;
  });
  if (state.query.trim()) {
    return rankSemanticSearch(state.query, filtered, { minScore: 0.0001 }).map(({ item }) => item);
  }
  return sortBooks([...filtered], state.sortKey, state.language);
}

/** Audiobooks use the same semantic ranking contract as books. */
export function prepareAudiobookLibraryResults(
  audiobooks: readonly AudiobookRecord[],
  state: AudiobookLibrarySearchState,
): AudiobookRecord[] {
  const filtered = audiobooks.filter((audiobook) =>
    !state.selectedCategory || audiobook.category.includes(state.selectedCategory)
  );
  if (state.query.trim()) {
    return rankSemanticSearch(state.query, filtered, { minScore: 0.0001 }).map(({ item }) => item);
  }
  return sortAudiobooks([...filtered], state.sortKey, state.language);
}
