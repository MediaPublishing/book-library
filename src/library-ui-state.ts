export type LibraryMode = "books" | "audiobooks";
export type LibraryFormatFilter = "all" | "epub" | "pdf";

export interface LibraryUiState {
  libraryMode: LibraryMode;
  formatFilter: LibraryFormatFilter;
  selectedTag: string;
  selectedAudiobookCategory: string;
  sortKey:
    | "title"
    | "author"
    | "year"
    | "size"
    | "newest"
    | "genre";
  filtersExpanded: boolean;
}

export const DEFAULT_LIBRARY_UI_STATE: LibraryUiState = {
  libraryMode: "books",
  formatFilter: "all",
  selectedTag: "",
  selectedAudiobookCategory: "",
  sortKey: "title",
  filtersExpanded: false,
};

const LIBRARY_MODES = new Set(["books", "audiobooks"]);
const FORMAT_FILTERS = new Set(["all", "epub", "pdf"]);
const SORT_KEYS = new Set(["title", "author", "year", "size", "newest", "genre"]);

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeLibraryUiState(value: unknown): LibraryUiState {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const mode = string(input.libraryMode);
  const format = string(input.formatFilter);
  const sortKey = string(input.sortKey);
  return {
    libraryMode: LIBRARY_MODES.has(mode) ? mode as LibraryMode : DEFAULT_LIBRARY_UI_STATE.libraryMode,
    formatFilter: FORMAT_FILTERS.has(format) ? format as LibraryFormatFilter : DEFAULT_LIBRARY_UI_STATE.formatFilter,
    selectedTag: string(input.selectedTag),
    selectedAudiobookCategory: string(input.selectedAudiobookCategory),
    sortKey: SORT_KEYS.has(sortKey) ? sortKey as LibraryUiState["sortKey"] : DEFAULT_LIBRARY_UI_STATE.sortKey,
    filtersExpanded: input.filtersExpanded === true,
  };
}

export function hasActiveLibraryFilters(state: LibraryUiState, query = ""): boolean {
  return Boolean(
    query.trim() ||
    (state.libraryMode === "books" && state.selectedTag) ||
    (state.libraryMode === "audiobooks" && state.selectedAudiobookCategory) ||
    state.formatFilter !== "all"
  );
}

export function resetLibraryFilters(state: LibraryUiState): void {
  state.selectedTag = "";
  state.selectedAudiobookCategory = "";
  state.formatFilter = "all";
}
