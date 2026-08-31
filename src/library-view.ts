import { ItemView, WorkspaceLeaf } from "obsidian";
import type BookLibrary from "./main";
import { MediaDetailModal } from "./media-detail-modal";
import {
  DEFAULT_LIBRARY_UI_STATE,
  hasActiveLibraryFilters,
  normalizeLibraryUiState,
  resetLibraryFilters,
  type LibraryMode,
  type LibraryFormatFilter,
  type LibraryUiState,
} from "./library-ui-state";
import { colorForString, formatBytes, initials, normalizeDisplayText, sortAudiobooks, sortBooks, type SortKey } from "./util";
import type { AudiobookRecord, BookRecord } from "./types";

export const BOOK_LIBRARY_VIEW = "book-library-view";

export class BookLibraryView extends ItemView {
  private plugin: BookLibrary;
  private query = "";
  private formatFilter: "all" | "epub" | "pdf" = "all";
  private selectedTag = "";
  private selectedAudiobookCategory = "";
  private libraryMode: LibraryMode = DEFAULT_LIBRARY_UI_STATE.libraryMode;
  private visibleLimit = 300;
  private sortKey: LibraryUiState["sortKey"] = DEFAULT_LIBRARY_UI_STATE.sortKey;
  private filtersExpanded = false;
  private searchTimer: number | null = null;
  private focusAfterRender: {
    selector: string;
    index?: number;
    fallbackSelector?: string;
    selectionStart?: number;
    selectionEnd?: number;
  } | null = null;
  private rootEl!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, plugin: BookLibrary) {
    super(leaf);
    this.plugin = plugin;
    const saved = normalizeLibraryUiState(this.plugin.settings.libraryUiState);
    this.libraryMode = saved.libraryMode;
    this.formatFilter = saved.formatFilter;
    if (this.libraryMode === "audiobooks") this.formatFilter = "all";
    this.selectedTag = saved.selectedTag;
    this.selectedAudiobookCategory = saved.selectedAudiobookCategory;
    this.sortKey = saved.sortKey;
    this.filtersExpanded = saved.filtersExpanded;
  }

  getViewType(): string {
    return BOOK_LIBRARY_VIEW;
  }

  getDisplayText(): string {
    return this.plugin.t("view.title");
  }

  getIcon(): string {
    return "book-open";
  }

  async onOpen(): Promise<void> {
    this.rootEl = this.contentEl;
    this.rootEl.empty();
    this.rootEl.addClass("book-library-root");
    await this.render();
  }

  async render(): Promise<void> {
    this.rootEl.empty();
    const toolbar = this.rootEl.createDiv({ cls: "book-library-toolbar" });
    const hasActiveFilter = Boolean(
      this.libraryMode === "books" ? this.selectedTag : this.selectedAudiobookCategory
    );
    const filterToggle = toolbar.createEl("button", {
      text: this.plugin.t(this.filtersExpanded ? "view.hideFilters" : "view.showFilters"),
      cls: "book-library-filter-toggle",
      title: this.plugin.t(this.filtersExpanded ? "view.hideFilters" : "view.showFilters"),
      attr: {
        "aria-expanded": String(this.filtersExpanded),
        "aria-pressed": String(hasActiveFilter),
      },
    });
    filterToggle.toggleClass("has-active-filter", hasActiveFilter);
    filterToggle.addEventListener("click", () => {
      this.rememberFocus(filterToggle);
      this.filtersExpanded = !this.filtersExpanded;
      this.persistUiState();
      void this.render();
    });

    const modeGroup = toolbar.createDiv({ cls: "book-library-formats" });
    for (const mode of ["books", "audiobooks"] as const) {
      const modeLabel = mode === "books" ? this.plugin.t("view.books") : this.plugin.t("view.audiobooks");
      const modeButton = modeGroup.createEl("button", {
        text: modeLabel,
        cls: "book-library-format book-library-mode",
        attr: { "aria-pressed": String(this.libraryMode === mode), "data-mode": mode },
      });
      modeButton.toggleClass("is-active", this.libraryMode === mode);
      modeButton.addEventListener("click", () => {
        this.rememberFocus(modeButton);
        this.libraryMode = mode;
        if (mode === "audiobooks") this.formatFilter = "all";
        this.selectedTag = "";
        this.selectedAudiobookCategory = "";
        this.visibleLimit = 300;
        this.persistUiState();
        void this.render();
      });
    }
    const search = toolbar.createEl("input", {
      type: "search",
      placeholder: this.plugin.t("view.searchPlaceholder"),
      cls: "book-library-search",
      attr: { "aria-label": this.plugin.t("view.searchPlaceholder") },
    });
    search.value = this.query;
    search.addEventListener("input", () => {
      if (this.searchTimer !== null) {
        window.clearTimeout(this.searchTimer);
      }
      this.searchTimer = window.setTimeout(() => {
        const selectionStart = search.selectionStart;
        const selectionEnd = search.selectionEnd;
        this.rememberFocus(search, selectionStart ?? undefined, selectionEnd ?? undefined);
        this.query = search.value;
        this.visibleLimit = 300;
        void this.render();
      }, 150);
    });

    const sortGroup = toolbar.createDiv({ cls: "book-library-sort" });
    sortGroup.createEl("span", { text: this.plugin.t("view.sortLabel"), cls: "book-library-sort-label" });
    const sortSelect = sortGroup.createEl("select", { cls: "book-library-sort-select" });
    const sortOptions: Array<{ key: SortKey; label: string }> = [
      { key: "title", label: this.plugin.t("view.sortTitle") },
      { key: "author", label: this.plugin.t("view.sortAuthor") },
      { key: "year", label: this.plugin.t("view.sortYear") },
      { key: "size", label: this.plugin.t("view.sortSize") },
      { key: "newest", label: this.plugin.t("view.sortNewest") },
      { key: "genre", label: this.plugin.t("view.sortGenre") },
    ];
    for (const option of sortOptions) {
      const el = sortSelect.createEl("option", { text: option.label, value: option.key });
      el.selected = this.sortKey === option.key;
    }
    sortSelect.setAttribute("aria-label", this.plugin.t("view.sortLabel"));
    sortSelect.addEventListener("change", () => {
      this.sortKey = sortSelect.value as SortKey;
      this.visibleLimit = 300;
      this.persistUiState();
      this.renderResults();
    });

    if (this.libraryMode === "books") {
      const formatGroup = toolbar.createDiv({ cls: "book-library-formats", attr: { "aria-label": this.plugin.t("view.detailsFormat") } });
      for (const format of ["all", "epub", "pdf"] as const) {
        const button = formatGroup.createEl("button", {
          text: format.toUpperCase(),
          cls: "book-library-format",
          attr: { "aria-pressed": String(this.formatFilter === format), "data-format": format },
        });
        button.toggleClass("is-active", this.formatFilter === format);
        button.addEventListener("click", () => {
          this.rememberFocus(button);
          this.formatFilter = format;
          this.visibleLimit = 300;
          this.persistUiState();
          void this.render();
        });
      }
    }

    if (this.hasActiveFilters()) {
      const resetButton = toolbar.createEl("button", {
        text: this.plugin.t("view.resetFilters"),
        cls: "book-library-action",
        attr: { "data-reset-filters": "true" },
      });
      resetButton.addEventListener("click", () => {
        this.rememberFocus(resetButton, undefined, undefined, ".book-library-filter-toggle");
        this.query = "";
        this.visibleLimit = 300;
        this.resetFilters();
        this.persistUiState();
        void this.render();
      });
    }

    const scanButton = toolbar.createEl("button", {
      text: this.plugin.t("view.scan"),
      cls: "book-library-action",
    });
    scanButton.addEventListener("click", async () => {
      scanButton.setText(this.plugin.t("view.scanning"));
      if (this.libraryMode === "audiobooks") await this.plugin.scanAudiobooks();
      else await this.plugin.scanLibrary();
      await this.render();
    });

    const setupButton = toolbar.createEl("button", {
      text: this.plugin.t("view.setup"),
      cls: "book-library-action",
    });
    setupButton.addEventListener("click", () => this.plugin.openSetupWizard());

    const addButton = toolbar.createEl("button", {
      text: this.plugin.t("view.addAudiobook"),
      cls: "book-library-action",
    });
    addButton.addEventListener("click", () => this.plugin.openManualAudiobookModal());

    const openPath = toolbar.createEl("button", {
      text: this.plugin.t("view.openLibrary"),
      cls: "book-library-action",
    });
    openPath.addEventListener("click", async () => {
      if (this.libraryMode === "audiobooks") await this.plugin.openAudiobookCatalogFolder();
      else await this.plugin.openCatalogFolder();
    });

    const stats = toolbar.createDiv({ cls: "book-library-stats" });
    stats.setAttribute("aria-live", "polite");
    if (this.libraryMode === "books") {
      const books = this.plugin.getBooks();
      const filtered = this.filterBooks(books);
      stats.setText(this.plugin.t("view.stats", { count: filtered.length, total: books.length }));
      const tags = this.renderTagChips(books, this.filtersExpanded);
      if (tags) this.rootEl.appendChild(tags);
    } else {
      const audiobooks = Object.values(this.plugin.getAudiobooks());
      const filtered = this.filterAudiobooks(audiobooks);
      stats.setText(this.plugin.t("view.stats", { count: filtered.length, total: audiobooks.length }).replace(this.plugin.t("view.statsBooksName"), this.plugin.t("view.audiobooks")));
      const categories = this.renderAudiobookCategoryChips(audiobooks, this.filtersExpanded);
      if (categories) this.rootEl.appendChild(categories);
    }

    this.rootEl.createDiv({ cls: "book-library-grid" });
    this.renderResults();
    this.restoreFocus();
  }

  private renderTagChips(books: BookRecord[], expanded: boolean): HTMLElement | null {
    const counts = new Map<string, number>();
    for (const book of books) {
      for (const tag of book.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    if (counts.size === 0) return null;
    if (!expanded && !this.selectedTag) return null;
    const container = this.rootEl.createDiv({ cls: "book-library-tags" });
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const visibleEntries = expanded ? entries.slice(0, 40) : entries.filter(([tag]) => tag === this.selectedTag);
    for (const [tag, count] of visibleEntries) {
      const chip = container.createEl("button", {
        text: `${tag} ${count}`,
        cls: "book-library-tag",
        attr: { "data-tag": tag },
      });
      chip.toggleClass("is-active", this.selectedTag === tag);
      chip.setAttribute("aria-pressed", String(this.selectedTag === tag));
      chip.addEventListener("click", () => {
        const fallback = this.selectedTag === tag && !this.filtersExpanded ? ".book-library-filter-toggle" : undefined;
        this.rememberFocus(chip, undefined, undefined, fallback);
        this.selectedTag = this.selectedTag === tag ? "" : tag;
        this.visibleLimit = 300;
        this.persistUiState();
        this.render();
      });
    }
    return container;
  }

  private renderAudiobookCategoryChips(audiobooks: AudiobookRecord[], expanded: boolean): HTMLElement | null {
    const counts = new Map<string, number>();
    for (const audiobook of audiobooks) {
      for (const category of audiobook.category) counts.set(category, (counts.get(category) || 0) + 1);
    }
    if (counts.size === 0) return null;
    if (!expanded && !this.selectedAudiobookCategory) return null;
    const container = this.rootEl.createDiv({ cls: "book-library-tags" });
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const visibleEntries = expanded
      ? entries
      : entries.filter(([category]) => category === this.selectedAudiobookCategory);
    for (const [category, count] of visibleEntries) {
      const chip = container.createEl("button", {
        text: category + " " + count,
        cls: "book-library-tag",
        attr: { "data-audiobook-category": category },
      });
      chip.toggleClass("is-active", this.selectedAudiobookCategory === category);
      chip.setAttribute("aria-pressed", String(this.selectedAudiobookCategory === category));
      chip.addEventListener("click", () => {
        const fallback = this.selectedAudiobookCategory === category && !this.filtersExpanded ? ".book-library-filter-toggle" : undefined;
        this.rememberFocus(chip, undefined, undefined, fallback);
        this.selectedAudiobookCategory = this.selectedAudiobookCategory === category ? "" : category;
        this.visibleLimit = 300;
        this.persistUiState();
        void this.render();
      });
    }
    return container;
  }

  private filterAudiobooks(audiobooks: AudiobookRecord[]): AudiobookRecord[] {
    const q = this.query.toLowerCase().trim();
    return audiobooks.filter((audiobook) => {
      if (this.selectedAudiobookCategory && !audiobook.category.includes(this.selectedAudiobookCategory)) return false;
      if (q && !(audiobook.title + " " + audiobook.author + " " + audiobook.category.join(" ")).toLowerCase().includes(q)) return false;
      return true;
    });
  }

  private hasActiveFilters(): boolean {
    return hasActiveLibraryFilters(
      {
        libraryMode: this.libraryMode,
        formatFilter: this.formatFilter,
        selectedTag: this.selectedTag,
        selectedAudiobookCategory: this.selectedAudiobookCategory,
        sortKey: this.sortKey,
        filtersExpanded: this.filtersExpanded,
      },
      this.query
    );
  }

  private persistUiState(): void {
    this.plugin.settings.libraryUiState = normalizeLibraryUiState({
      libraryMode: this.libraryMode,
      formatFilter: this.formatFilter,
      selectedTag: this.selectedTag,
      selectedAudiobookCategory: this.selectedAudiobookCategory,
      sortKey: this.sortKey,
      filtersExpanded: this.filtersExpanded,
    });
    void this.plugin.saveSettings();
  }

  private resetFilters(): void {
    const state = normalizeLibraryUiState({
      libraryMode: this.libraryMode,
      formatFilter: this.formatFilter,
      selectedTag: this.selectedTag,
      selectedAudiobookCategory: this.selectedAudiobookCategory,
      sortKey: this.sortKey,
      filtersExpanded: this.filtersExpanded,
    });
    resetLibraryFilters(state);
    this.formatFilter = state.formatFilter;
    this.selectedTag = state.selectedTag;
    this.selectedAudiobookCategory = state.selectedAudiobookCategory;
  }

  private rememberFocus(
    element: HTMLElement,
    selectionStart?: number,
    selectionEnd?: number,
    fallbackSelector?: string,
  ): void {
    const selector = this.focusSelector(element);
    if (!selector) {
      this.focusAfterRender = fallbackSelector ? { selector: fallbackSelector } : null;
      return;
    }
    const candidates = Array.from(this.rootEl.querySelectorAll<HTMLElement>(selector));
    const index = candidates.indexOf(element);
    this.focusAfterRender = {
      selector,
      index: index >= 0 ? index : undefined,
      fallbackSelector,
      selectionStart,
      selectionEnd,
    };
  }

  private focusSelector(element: HTMLElement): string | null {
    if (element.matches(".book-library-search")) return ".book-library-search";
    if (element.matches(".book-library-filter-toggle")) return ".book-library-filter-toggle";
    if (element.matches(".book-library-mode")) return ".book-library-mode";
    if (element.matches(".book-library-sort-select")) return ".book-library-sort-select";
    if (element.matches("[data-format]")) return "[data-format]";
    if (element.matches(".book-library-tag")) return ".book-library-tag";
    if (element.matches("[data-reset-filters]")) return "[data-reset-filters]";
    return null;
  }

  private restoreFocus(): void {
    const pending = this.focusAfterRender;
    this.focusAfterRender = null;
    if (!pending) return;
    const candidates = Array.from(this.rootEl.querySelectorAll<HTMLElement>(pending.selector));
    const target = (typeof pending.index === "number" ? candidates[pending.index] : candidates[0])
      || (pending.fallbackSelector ? this.rootEl.querySelector<HTMLElement>(pending.fallbackSelector) : null);
    if (!target) return;
    target.focus();
    if (target instanceof HTMLInputElement && typeof pending.selectionStart === "number" && typeof pending.selectionEnd === "number") {
      target.setSelectionRange(pending.selectionStart, pending.selectionEnd);
    }
  }

  private renderResults(): void {
    if (this.libraryMode === "audiobooks") {
      this.renderAudiobooks();
      return;
    }
    this.renderBooks();
  }

  private filterBooks(books: BookRecord[]): BookRecord[] {
    const q = this.query.toLowerCase().trim();
    return books.filter((book) => {
      if (this.formatFilter !== "all" && book.format !== this.formatFilter) return false;
      if (this.selectedTag && !book.tags.includes(this.selectedTag)) return false;
      if (q && !`${book.title} ${book.author} ${book.tags.join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  private sortedBooks(books: BookRecord[]): BookRecord[] {
    return sortBooks(books, this.sortKey, this.plugin.language);
  }

  private sortedAudiobooks(books: AudiobookRecord[]): AudiobookRecord[] {
    return sortAudiobooks(books, this.sortKey, this.plugin.language);
  }

  private renderBooks(): void {
    try {
      const grid = this.rootEl.querySelector(".book-library-grid") as HTMLElement;
      if (!grid) return;
      grid.empty();
      const allBooks = this.plugin.getBooks();
      const books = this.sortedBooks(this.filterBooks(allBooks));
      if (books.length === 0) {
        const empty = grid.createDiv({ cls: "book-library-empty" });
        const filteredEmpty = allBooks.length > 0;
        empty.setAttribute("data-empty-state", filteredEmpty ? "filtered" : "library");
        empty.createDiv({
          text: filteredEmpty
            ? this.plugin.t("view.stats", { count: 0, total: allBooks.length })
            : this.plugin.t("view.empty"),
        });
        const actions = empty.createDiv({ cls: "book-library-empty-actions" });
        if (filteredEmpty) {
          const reset = actions.createEl("button", {
            text: this.plugin.t("view.resetFilters"),
            cls: "book-library-action",
          });
          reset.addEventListener("click", () => {
            this.rememberFocus(reset, undefined, undefined, ".book-library-filter-toggle");
            this.query = "";
            this.resetFilters();
            this.persistUiState();
            void this.render();
          });
        } else {
          const setup = actions.createEl("button", {
            text: this.plugin.t("view.setupAction"),
            cls: "book-library-action",
          });
          setup.addEventListener("click", () => this.plugin.openSetupWizard());
          const scan = actions.createEl("button", {
            text: this.plugin.t("view.scanAction"),
            cls: "book-library-action",
          });
          scan.addEventListener("click", () => void this.plugin.scanLibrary());
        }
        return;
      }
      const visible = books.slice(0, this.visibleLimit);
      for (const book of visible) {
        this.renderCard(grid, book);
      }
      if (books.length > visible.length) {
        this.createLoadMoreButton(grid, books.length, false);
      }
    } catch (error) {
      this.plugin.logDebug(`renderBooks:error=${String(error).slice(0, 400)}`);
    }
  }

  private renderAudiobooks(): void {
    try {
      const grid = this.rootEl.querySelector(".book-library-grid") as HTMLElement;
      if (!grid) return;
      grid.empty();
      const audiobooks = this.sortedAudiobooks(this.filterAudiobooks(Object.values(this.plugin.getAudiobooks())));
      if (audiobooks.length === 0) {
        const total = Object.values(this.plugin.getAudiobooks()).length;
        const empty = grid.createDiv({ cls: "book-library-empty" });
        empty.createDiv({
          text: this.plugin.t(total === 0 ? "view.noAudiobooksConfigured" : "view.noAudiobooks"),
        });
        if (total === 0) {
          const actions = empty.createDiv({ cls: "book-library-empty-actions" });
          const setup = actions.createEl("button", {
            text: this.plugin.t("view.setupAction"),
            cls: "book-library-action",
          });
          setup.addEventListener("click", () => this.plugin.openSetupWizard());
          const add = actions.createEl("button", {
            text: this.plugin.t("view.addAudiobookAction"),
            cls: "book-library-action",
          });
          add.addEventListener("click", () => this.plugin.openManualAudiobookModal());
        }
        return;
      }
      const visible = audiobooks.slice(0, this.visibleLimit);
      for (const audiobook of visible) {
        this.appendAudiobookCard(grid, audiobook);
      }
      if (audiobooks.length > visible.length) {
        this.createLoadMoreButton(grid, audiobooks.length, true);
      }
    } catch (error) {
      this.plugin.logDebug("renderAudiobooks:error=" + String(error).slice(0, 400));
    }
  }

  private renderCard(grid: HTMLElement, book: BookRecord): void {
    const card = grid.createEl("article", { cls: "book-library-card" });
    const cover = card.createDiv({ cls: "book-library-cover" });
    const bookTitle = normalizeDisplayText(book.title);
    const renderPlaceholder = (): void => {
      if (cover.querySelector(".book-library-cover-placeholder")) return;
      const icon = cover.createDiv({ cls: "book-library-cover-placeholder" });
      icon.setText(initials(bookTitle));
      icon.style.setProperty("--book-library-cover-color", colorForString(bookTitle));
    };
    const coverUrl = book.cover ? this.plugin.getCoverUrl(book.cover) : "";
    if (coverUrl) {
      const img = cover.createEl("img", { cls: "book-library-cover-img" });
      img.alt = bookTitle;
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", () => {
        img.remove();
        renderPlaceholder();
      }, { once: true });
      img.src = coverUrl;
    } else {
      renderPlaceholder();
    }
    const meta = card.createDiv({ cls: "book-library-card-meta" });
    meta.createEl("div", { text: bookTitle, cls: "book-library-card-title" });
    meta.createEl("div", {
      text: normalizeDisplayText(book.author) || this.plugin.t("view.unknownAuthor"),
      cls: "book-library-card-author",
    });
    const badges = meta.createDiv({ cls: "book-library-card-badges" });
    if (book.wikiStatus === "done") {
      badges.createSpan({ text: this.plugin.t("view.badgeWiki"), cls: "book-library-badge is-wiki" });
    }
    if (book.markdownPath) {
      badges.createSpan({ text: this.plugin.t("view.badgeMarkdown"), cls: "book-library-badge is-markdown" });
    }
    meta.createDiv({ cls: "book-library-card-line" }).setText(
      `${book.format?.toUpperCase() || ""} ${formatBytes(book.size)}${book.tags.slice(0, 2).map((t) => ` #${t}`).join("")}`
    );
    const actions = card.createDiv({ cls: "book-library-card-actions" });
    const open = actions.createEl("button", {
      text: this.plugin.t("view.detailsOpenFile"),
      cls: "book-library-card-open mod-cta",
    });
    open.setAttribute("aria-label", `${bookTitle}: ${this.plugin.t("view.detailsOpenFile")}`);
    open.addEventListener("click", () => void this.plugin.openBookFile(book));
    const details = actions.createEl("button", {
      text: this.plugin.t("view.details"),
      cls: "book-library-details",
    });
    details.addEventListener("click", (event) => {
      event.stopPropagation();
      new MediaDetailModal(this.app, book, {
        t: (key, params) => this.plugin.t(key, params),
        getCoverUrl: (cover) => this.plugin.getCoverUrl(cover),
        openFile: (target) => void this.plugin.openBookFile(target as BookRecord),
        revealFolder: (target) => void this.plugin.revealBookFolder(target as BookRecord),
        openNote: (target) => this.openBookNote(target as BookRecord),
        openAuthor: (target) => void this.plugin.openAuthorProfile(target),
        getBookByHash: (hash) => this.plugin.getBookByHash(hash),
        technicalExpanded: this.plugin.settings.technicalDetailsExpanded,
        detailMode: this.plugin.settings.detailMode,
        reviewsEnabled: this.plugin.settings.reviewsEnabled,
      }).open();
    });
  }

  private createLoadMoreButton(grid: HTMLElement, totalCount: number, audiobooks: boolean): void {
    const remaining = Math.min(500, totalCount - this.visibleLimit);
    const more = grid.createDiv({ cls: "book-library-more" });
    const button = more.createEl("button", {
      text: this.plugin.t("view.loadMore", { count: remaining }),
      cls: "book-library-action",
    });
    button.addEventListener("click", () => {
      const start = this.visibleLimit;
      this.visibleLimit = Math.min(totalCount, start + 500);
      more.remove();
      const insertionIndex = grid.children.length;
      if (audiobooks) {
        const records = this.sortedAudiobooks(this.filterAudiobooks(Object.values(this.plugin.getAudiobooks())));
        for (const record of records.slice(start, this.visibleLimit)) {
          this.appendAudiobookCard(grid, record);
        }
      } else {
        for (const record of this.sortedBooks(this.filterBooks(this.plugin.getBooks())).slice(start, this.visibleLimit)) {
          this.renderCard(grid, record);
        }
      }
      if (this.visibleLimit < totalCount) this.createLoadMoreButton(grid, totalCount, audiobooks);
      const firstNewCard = grid.children[insertionIndex];
      if (firstNewCard instanceof HTMLElement) {
        firstNewCard.querySelector<HTMLElement>("button, a, [tabindex]:not([tabindex='-1'])")?.focus();
      }
    });
  }

  async onClose(): Promise<void> {
    if (this.searchTimer !== null) {
      window.clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

  private appendAudiobookCard(grid: HTMLElement, audiobook: AudiobookRecord): void {
    const card = grid.createEl("article", { cls: "book-library-card" });
    const cover = card.createDiv({ cls: "book-library-cover" });
    const renderPlaceholder = (): void => {
      if (cover.querySelector(".book-library-cover-placeholder")) return;
      const icon = cover.createDiv({ cls: "book-library-cover-placeholder" });
      const audiobookTitle = normalizeDisplayText(audiobook.title);
      icon.setText(initials(audiobookTitle));
      icon.style.setProperty("--book-library-cover-color", colorForString(audiobookTitle));
    };
    const coverUrl = this.plugin.getAudiobookCoverUrl(audiobook.cover);
    if (coverUrl) {
      const img = cover.createEl("img", { cls: "book-library-cover-img" });
      img.alt = normalizeDisplayText(audiobook.title);
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", () => {
        img.remove();
        renderPlaceholder();
      }, { once: true });
      img.src = coverUrl;
    } else {
      renderPlaceholder();
    }
    const meta = card.createDiv({ cls: "book-library-card-meta" });
    const audiobookTitle = normalizeDisplayText(audiobook.title);
    meta.createEl("div", { text: audiobookTitle, cls: "book-library-card-title" });
    meta.createEl("div", {
      text: normalizeDisplayText(audiobook.author) || this.plugin.t("view.unknownAuthor"),
      cls: "book-library-card-author",
    });
    const badges = meta.createDiv({ cls: "book-library-card-badges" });
    badges.createSpan({ text: this.plugin.t("view.badgeAudiobook"), cls: "book-library-badge is-audio" });
    const categories = audiobook.category
      .filter((category) => category !== "Audiobooks")
      .slice(0, 2)
      .map((category) => ` #${category}`)
      .join("");
    const audioFormat = audiobook.audioFormats.join(", ") || audiobook.mediaType.toUpperCase();
    meta.createDiv({ cls: "book-library-card-line" }).setText(
      `${audioFormat} ${formatBytes(audiobook.audioBytes)}${categories}`
    );
    this.renderAudiobookActions(card, audiobook);
  }

  private openBookNote(book: BookRecord): void {
    this.plugin.openBookNote(book);
  }

  private renderAudiobookActions(card: HTMLElement, audiobook: AudiobookRecord): void {
    const actions = card.createDiv({ cls: "book-library-card-actions" });
    const open = actions.createEl("button", { text: this.plugin.t("view.openAudiobook"), cls: "book-library-card-open mod-cta" });
    open.setAttribute("aria-label", `${normalizeDisplayText(audiobook.title)}: ${this.plugin.t("view.openAudiobook")}`);
    open.addEventListener("click", () => void this.plugin.openAudiobookSource(audiobook));
    const details = actions.createEl("button", { text: this.plugin.t("view.details"), cls: "book-library-details" });
    details.addEventListener("click", (event) => {
      event.stopPropagation();
      this.openAudiobookModal(audiobook);
    });
  }

  private openAudiobookModal(audiobook: AudiobookRecord): void {
    new MediaDetailModal(this.app, audiobook, {
      t: (key, params) => this.plugin.t(key, params),
      getCoverUrl: (cover) => this.plugin.getAudiobookCoverUrl(cover),
      openFile: (target) => void this.plugin.openAudiobookSource(target as AudiobookRecord),
      openNote: (target) => this.plugin.openAudiobookNote(target as AudiobookRecord),
      openAuthor: (target) => void this.plugin.openAuthorProfile(target),
      getBookByHash: (hash) => this.plugin.getBookByHash(hash),
      openTopicLink: (link) => this.plugin.openTopicLink(link),
      technicalExpanded: this.plugin.settings.technicalDetailsExpanded,
      detailMode: this.plugin.settings.detailMode,
      reviewsEnabled: this.plugin.settings.reviewsEnabled,
    }).open();
  }
}
