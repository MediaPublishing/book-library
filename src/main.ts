import {
  App,
  Modal,
  Notice,
  Plugin,
  Platform,
  MarkdownView,
  TFile,
  TFolder,
  requestUrl,
} from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { BOOK_LIBRARY_VIEW, BookLibraryView } from "./library-view";
import { SetupWizardModal, classifyBookScanStatus, type SetupScanCallback, type SetupScanResult } from "./setup-wizard-modal";
import { BookLibrarySettingTab } from "./settings";
import { LibraryIndexer, normalizeBookRecord } from "./indexer";
import { MetadataProvider } from "./metadata";
import { computeRelatedBooks } from "./related";
import { convertEpubToMarkdown } from "./conversion";
import { AiPipeline, buildMetadataWiki, buildWikiIndex, hasMetadataWikiSource, type BudgetState } from "./ai";
import {
  AI_COVER_GRID,
  buildCoverSheetPrompt,
  createCoverBatchManifest,
  generateCoverSheet,
  hasUsableCoverIdentity,
  sliceCoverSheet,
} from "./ai-covers";
import {
  audiobookSourceLink,
  buildLocalAudiobookIndex,
  normalizeAudiobookIndex,
  normalizeAudiobookRecord,
  upsertManualAudiobook,
  writeAudiobookCatalog,
} from "./audiobooks";
import { enrichAudiobooks, type AudiobookEnrichmentProvider } from "./audiobook-enrichment";
import { ManualAudiobookModal } from "./manual-audiobook-modal";
import { normalizeLibraryUiState } from "./library-ui-state";
import { catalogFileName, catalogLinkTarget, renderCatalogRecord } from "./catalog";
import { openCatalogNote } from "./catalog-navigation";
import {
  archiveReplacedCatalogNotes,
  refreshCatalogPaths,
} from "./catalog-maintenance";
import { writeBookTopicMocs } from "./topics";
import { writeAuthorProfiles, writeAuthorProfilesDetailed } from "./authors";
import { authorProfileId, authorProfileLink } from "./author-id";
import { collapseGeneratedNoteProperties, isGeneratedCatalogNote } from "./catalog-properties";
import { isBookLibraryOwnedMarkdown, resolveGeneratedNoteTarget } from "./generated-note";
import { applyFetchedMetadata, applyMichaelHudsonPilotIdentity, isMichaelHudsonPilotBook } from "./enrichment";
import { isValidHttpUrl } from "./util";
import { backfillMissingCovers } from "./cover-backfill";
import { resolveBookFilePath, resolveBookFolderPath, resolveContainedPath } from "./book-file";
import { DEFAULT_SETTINGS, CATALOG_VERSION, type AudiobookIndex, type AudiobookRecord, type BookIndex, type BookRecord, type LibrarySettings, type ManualAudiobookInput } from "./types";
import {
  detectSystemLanguage,
  resolveLanguage,
  translate,
  type Language,
  type TranslationKey,
} from "./i18n";

export default class BookLibrary extends Plugin {
  settings: LibrarySettings = { ...DEFAULT_SETTINGS };
  private index: BookIndex = { version: CATALOG_VERSION, generatedAt: "", entries: {} };
  private audiobookIndex: AudiobookIndex | null = null;
  private statusBarItem: HTMLElement | null = null;
  private propertiesCollapsedThisSession = new Set<string>();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.setText("");
    this.registerView(
      BOOK_LIBRARY_VIEW,
      (leaf) => new BookLibraryView(leaf, this)
    );
    this.addSettingTab(new BookLibrarySettingTab(this.app, this));
    this.loadIndexFromDisk();
    this.loadAudiobookIndexFromDisk();
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      if (!file) return;
      void isGeneratedCatalogNote(this.app.vault.adapter, file.path, this.settings.catalogDir)
        .then((generated) => {
          if (generated) this.collapseCatalogPropertiesOnce(file.path);
        });
    }));

    // Test-/Demo-Hook: Liegt die Datei "auto-open" im Plugin-Ordner, öffnet
    // das Plugin die Book-Library-View direkt nach dem Laden. Für reguläre
    // Installationen existiert diese Datei nicht.
    const pluginDir = path.join(this.resolveVaultPath(".obsidian"), "plugins", this.manifest.id);
    const autoOpenMarker = path.join(pluginDir, "auto-open");
    if (fs.existsSync(autoOpenMarker)) {
      try {
        fs.writeFileSync(path.join(pluginDir, "onload.log"), `loaded ${new Date().toISOString()}\n`, "utf8");
      } catch {
        // Log ist nur für den Client-Test gedacht.
      }
      this.app.workspace.onLayoutReady(() => {
        void this.activateView();
      });
    }
    const autoScanMarker = path.join(pluginDir, "auto-scan");
    if (fs.existsSync(autoScanMarker)) {
      this.app.workspace.onLayoutReady(() => {
        setTimeout(() => {
          void this.scanLibrary().then(() => this.refreshView());
        }, 800);
      });
    }

    this.addCommand({
      id: "open-book-library",
      name: this.t("command.openLibrary"),
      callback: () => this.activateView(),
    });
    this.addCommand({
      id: "setup-book-library",
      name: this.t("command.setup"),
      callback: () => new SetupWizardModal(this.app, this).open(),
    });
    this.addCommand({
      id: "add-audiobook-manually",
      name: this.t("command.addAudiobook"),
      callback: () => this.openManualAudiobookModal(),
    });
    this.addCommand({
      id: "repair-metadata-text",
      name: this.t("command.repairMetadata"),
      callback: async () => {
        await this.repairMetadataText();
      },
    });
    this.addCommand({
      id: "scan-book-library",
      name: this.t("command.scan"),
      callback: async () => {
        await this.scanLibrary();
      },
    });
    this.addCommand({
      id: "scan-audiobook-library",
      name: this.t("command.scanAudiobooks"),
      callback: async () => {
        await this.scanAudiobooks();
      },
    });
    this.addCommand({
      id: "convert-books-to-markdown",
      name: this.t("command.convert"),
      callback: async () => {
        await this.convertNextBooks();
      },
    });
    this.addCommand({
      id: "generate-book-wiki",
      name: this.t("command.wiki"),
      callback: async () => {
        await this.generateNextWikis();
      },
    });
    this.addCommand({
      id: "fetch-missing-covers",
      name: this.t("command.fetchCovers"),
      callback: async () => {
        await this.fetchMissingCovers();
      },
    });
    this.addCommand({
      id: "generate-ai-covers",
      name: this.t("command.aiCovers"),
      callback: async () => {
        await this.generateAiCovers();
      },
    });
    this.addCommand({
      id: "build-wiki-index",
      name: this.t("command.wikiIndex"),
      callback: async () => {
        await this.buildWikiIndexCommand();
      },
    });
    this.addCommand({
      id: "re-render-catalog",
      name: this.t("command.rerenderCatalog"),
      callback: async () => {
        await this.reRenderCatalog();
      },
    });
    if (fs.existsSync(path.join(pluginDir, "enable-enrichment-pilot"))) {
      this.addCommand({
        id: "enrich-michael-hudson-pilot",
        name: this.language === "de" ? "Michael-Hudson-Pilot anreichern" : "Enrich Michael Hudson pilot",
        callback: async () => {
          await this.enrichMichaelHudsonPilot();
        },
      });
    }
    this.addCommand({
      id: "open-plugin-folder",
      name: this.t("command.openPluginFolder"),
      callback: async () => {
        await this.openPluginFolder();
      },
    });
    this.addCommand({
      id: "upgrade-to-pro",
      name: this.t("command.pro"),
      callback: () => this.startUpgrade(),
    });
  }

  onunload(): void {
    this.propertiesCollapsedThisSession.clear();
    this.app.workspace.detachLeavesOfType(BOOK_LIBRARY_VIEW);
  }

  async activateView(): Promise<void> {
    try {
      this.logDebug("activate:start");
      const existing = this.app.workspace.getLeavesOfType(BOOK_LIBRARY_VIEW)[0];
      const leaf = existing ?? this.app.workspace.getLeaf("tab");
      if (!leaf) {
        new Notice(this.t("notice.noLeaf"));
        this.logDebug("activate:no-leaf");
        return;
      }
      this.logDebug(`activate:leaf=${leaf.getViewState()?.type ?? "?"}`);
      await leaf.setViewState({ type: BOOK_LIBRARY_VIEW, active: true });
      this.logDebug("activate:setViewState-ok");
      this.app.workspace.revealLeaf(leaf);
      this.logDebug("activate:reveal-ok");
    } catch (error) {
      this.logDebug(`activate:error=${String(error).slice(0, 200)}`);
    }
  }

  async chooseDirectory(defaultPath = ""): Promise<string | null> {
    if (!Platform.isDesktopApp) {
      new Notice(this.t("notice.desktopOnly"));
      return null;
    }
    try {
      const electron = (window as unknown as {
        require?: (moduleName: string) => {
          dialog?: {
            showOpenDialog: (options: unknown) => Promise<{ canceled?: boolean; filePaths?: string[] }>;
          };
        };
      }).require?.("electron");
      if (!electron?.dialog?.showOpenDialog) return null;
      const result = await electron.dialog.showOpenDialog({
        defaultPath: defaultPath || undefined,
        properties: ["openDirectory", "createDirectory"],
      });
      return result.canceled ? null : result.filePaths?.[0] || null;
    } catch {
      return null;
    }
  }

  openSetupWizard(): void {
    new SetupWizardModal(this.app, this).open();
  }

  logDebug(message: string): void {
    try {
      const pluginDir = path.join(this.resolveVaultPath(".obsidian"), "plugins", this.manifest.id);
      fs.appendFileSync(path.join(pluginDir, "onload.log"), `${new Date().toISOString()} ${message}\n`, "utf8");
    } catch {
      // Log ist nur für den Client-Test gedacht.
    }
  }

  getBooks(): BookRecord[] {
    return Object.values(this.index.entries);
  }

  getBookByHash(hash: string): BookRecord | undefined {
    return this.index.entries[hash];
  }

  getAudiobooks(): AudiobookIndex["entries"] {
    return this.audiobookIndex?.entries || {};
  }

  get language(): Language {
    return resolveLanguage(this.settings.language, detectSystemLanguage());
  }

  t(key: TranslationKey, params?: Record<string, string | number>): string {
    return translate(this.language, key, params);
  }

  getCoverUrl(coverFile: string): string {
    const file = this.app.vault.getAbstractFileByPath(`${this.settings.coversDir}/${coverFile}`);
    if (file instanceof TFile) {
      return this.app.vault.getResourcePath(file);
    }
    return "";
  }

  getAudiobookCoverUrl(coverFile: string): string {
    if (!coverFile) return "";
    const file = this.app.vault.getAbstractFileByPath(`${this.settings.audiobookCatalogDir}/covers/${coverFile}`);
    if (file instanceof TFile) {
      return this.app.vault.getResourcePath(file);
    }
    return "";
  }

  async openBookNote(book: BookRecord): Promise<void> {
    try {
      await openCatalogNote(
        {
          workspace: this.app.workspace,
          vault: this.app.vault,
          openNotePath: (notePath) => this.openVaultNoteVisible(notePath),
        },
        book,
        this.settings.catalogDir,
        (target) => this.renderBookCatalog(target)
      );
      this.saveIndexToDisk();
    } catch {
      new Notice(this.t("notice.openNoteFailed", { title: book.title }));
    }
  }

  async openAuthorProfile(book: BookRecord): Promise<void> {
    try {
      const authorsDir = path.posix.join(this.settings.catalogDir, "authors");
      const authorId = authorProfileId(book);
      const authorBooks = this.getBooks().filter((candidate) => authorProfileId(candidate) === authorId);
      const writeResult = writeAuthorProfilesDetailed(
        authorBooks,
        this.resolveVaultPath(authorsDir),
        this.language,
        this.settings.catalogDir
      );
      if (writeResult.skipped.length) throw new Error("Author profile target is user-owned");
      this.saveIndexToDisk();
      const notePath = `${authorProfileLink(book, authorsDir)}.md`;
      if (!await this.app.vault.adapter.exists(notePath)) throw new Error("Author profile was not generated");
      const content = await this.app.vault.adapter.read(notePath);
      if (!isBookLibraryOwnedMarkdown(content, "author")) throw new Error("Author profile target is user-owned");
      await this.openVaultNoteVisible(notePath);
    } catch {
      new Notice(this.t("notice.openNoteFailed", { title: book.author || book.title }));
    }
  }

  async openBookFile(book: BookRecord): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice(this.t("notice.openFileDesktopOnly"));
      return;
    }
    const target = resolveBookFilePath(this.settings.libraryPath, book.file);
    if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      new Notice(this.t("notice.openFileMissing", { title: book.title }));
      return;
    }
    try {
      const electron = (window as unknown as {
        require?: (moduleName: string) => { shell?: { openPath: (filePath: string) => Promise<string> } };
      }).require?.("electron");
      if (!electron?.shell?.openPath) throw new Error("Electron shell.openPath unavailable");
      const error = await electron.shell.openPath(target);
      if (error) new Notice(this.t("notice.openFileFailed", { title: book.title }));
    } catch {
      new Notice(this.t("notice.openFileFailed", { title: book.title }));
    }
  }

  async revealBookFolder(book: BookRecord): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice(this.t("notice.openFolderDesktopOnly"));
      return;
    }
    const folder = resolveBookFolderPath(this.settings.libraryPath, book.file);
    if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
      new Notice(this.t("notice.openFolderMissing", { title: book.title }));
      return;
    }
    try {
      const electron = (window as unknown as {
        require?: (moduleName: string) => { shell?: { openPath: (filePath: string) => Promise<string> } };
      }).require?.("electron");
      if (!electron?.shell?.openPath) throw new Error("Electron shell.openPath unavailable");
      const error = await electron.shell.openPath(folder);
      if (error) new Notice(this.t("notice.openFolderFailed", { title: book.title }));
    } catch {
      new Notice(this.t("notice.openFolderFailed", { title: book.title }));
    }
  }

  async openAudiobookNote(audiobook: AudiobookRecord): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(
        audiobook.catalogPath || `${this.settings.audiobookCatalogDir}/${audiobook.id}.md`
      );
      if (!(file instanceof TFile)) throw new Error("Audiobook note is unavailable");
      await this.openVaultNoteVisible(file.path);
    } catch {
      new Notice(this.t("notice.openNoteFailed", { title: audiobook.title }));
    }
  }

  async openTopicLink(link: string): Promise<void> {
    try {
      const clean = link.replace(/^\/+/, "");
      const file = this.app.vault.getAbstractFileByPath(
        `${this.settings.catalogDir}/${clean}`
      );
      if (!(file instanceof TFile)) throw new Error("Topic note is unavailable");
      await this.openVaultNoteVisible(file.path);
    } catch {
      new Notice(this.t("notice.openNoteFailed", { title: link }));
    }
  }

  async openPluginFolder(): Promise<void> {
    await this.openLocalDirectory(path.join(
      this.resolveVaultPath(".obsidian"),
      "plugins",
      this.manifest.id
    ), "Book Library");
  }

  private async openLocalDirectory(folder: string, title: string): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice(this.t("notice.openFolderDesktopOnly"));
      return;
    }
    if (!fs.existsSync(folder)) {
      new Notice(this.t("notice.openFolderMissing", { title }));
      return;
    }
    try {
      const electron = (window as unknown as {
        require?: (moduleName: string) => { shell?: { openPath: (filePath: string) => Promise<string> } };
      }).require?.("electron");
      if (!electron?.shell?.openPath) throw new Error("Electron shell.openPath unavailable");
      const error = await electron.shell.openPath(folder);
      if (error) new Notice(this.t("notice.openFolderFailed", { title }));
    } catch {
      new Notice(this.t("notice.openFolderFailed", { title }));
    }
  }

  async openAudiobookSource(audiobook: AudiobookRecord): Promise<void> {
    const storagePath = (audiobook.storagePath || audiobook.legacyPrivatePath || "").trim();
    if (storagePath) {
      const localTarget = path.isAbsolute(storagePath)
        ? path.normalize(storagePath)
        : path.resolve(this.settings.audiobookLibraryPath, storagePath);
      if (fs.existsSync(localTarget)) {
        try {
          const electron = (window as unknown as {
            require?: (moduleName: string) => { shell?: { openPath: (filePath: string) => Promise<string> } };
          }).require?.("electron");
          if (!electron?.shell?.openPath) throw new Error("Electron shell.openPath unavailable");
          const error = await electron.shell.openPath(localTarget);
          if (!error) return;
        } catch {
          new Notice(this.t("notice.openFileFailed", { title: audiobook.title }));
          return;
        }
      }
    }
    const sourceLink = audiobookSourceLink(audiobook);
    if (!sourceLink || !isValidHttpUrl(sourceLink)) {
      new Notice(this.t("notice.openFileMissing", { title: audiobook.title }));
      return;
    }
    try {
      const electron = (window as unknown as {
        require?: (moduleName: string) => { shell?: { openExternal: (url: string) => Promise<void> } };
      }).require?.("electron");
      if (electron?.shell?.openExternal) {
        await electron.shell.openExternal(sourceLink);
      } else {
        window.open(sourceLink, "_blank", "noopener,noreferrer");
      }
    } catch {
      new Notice(this.t("notice.openFileFailed", { title: audiobook.title }));
    }
  }

  async openCatalogFolder(): Promise<void> {
    const folder = this.resolveVaultPath(this.settings.catalogDir);
    if (fs.existsSync(folder) && fs.statSync(folder).isDirectory()) {
      await this.openLocalDirectory(folder, "Book Library");
      return;
    }
    new Notice(this.t("notice.noCatalog"));
  }

  async openAudiobookCatalogFolder(): Promise<void> {
    const folder = this.resolveVaultPath(this.settings.audiobookCatalogDir);
    if (fs.existsSync(folder) && fs.statSync(folder).isDirectory()) {
      await this.openLocalDirectory(folder, this.t("view.audiobooks"));
      return;
    }
    new Notice(this.t("notice.noCatalog"));
  }

  isPro(): boolean {
    return this.settings.proLicenseKey.trim().length > 0;
  }

  async scanLibrary(onResult?: SetupScanCallback): Promise<SetupScanResult> {
    const libraryPath = this.settings.libraryPath.trim();
    if (!libraryPath || !fs.existsSync(libraryPath) || !fs.statSync(libraryPath).isDirectory()) {
      new Notice(this.t("notice.noPath"));
      const result: SetupScanResult = { status: "skipped", error: this.t("notice.noPath") };
      onResult?.(result);
      return result;
    }
    if (!Platform.isDesktopApp) {
      new Notice(this.t("notice.desktopOnly"));
      const result: SetupScanResult = { status: "failed", error: this.t("notice.desktopOnly") };
      onResult?.(result);
      return result;
    }
    const catalogDir = this.resolveVaultPath(this.settings.catalogDir);
    const coversDir = this.resolveVaultPath(this.settings.coversDir);
    const provider = new MetadataProvider((url) =>
      requestUrl({ url, throw: false }).then((res) => ({
        status: res.status,
        text: res.text,
        arrayBuffer: res.arrayBuffer,
      }))
    );
    const indexer = new LibraryIndexer(provider, {
      onProgress: (progress) => {
        if (this.statusBarItem) {
          this.statusBarItem.setText(
            progress.status === "done"
              ? ""
              : this.t("notice.scanProgress", { scanned: progress.scanned, total: progress.total })
          );
        }
        if (progress.scanned % 100 === 0 || progress.status === "done") {
          new Notice(
            this.t("notice.scanProgress", { scanned: progress.scanned, total: progress.total })
          );
        }
      },
    });
    let result: Awaited<ReturnType<LibraryIndexer["scan"]>>;
    try {
      result = await indexer.scan({
        libraryPath,
        catalogDir,
        coversDir,
        wikiDir: this.settings.wikiDir,
        includeExtensions: this.settings.includeExtensions,
        tagsFromFolders: this.settings.tagsFromFolders,
        fetchMetadata: this.settings.fetchMetadata,
        maxMetadataLookups: this.settings.maxBooksPerRun,
        maxFiles: this.settings.maxScanFiles,
        language: this.language,
        amazonUrlTemplate: this.settings.amazonUrlTemplate,
        goodreadsUrlTemplate: this.settings.goodreadsUrlTemplate,
      });
    } catch (error) {
      if (this.statusBarItem) this.statusBarItem.setText("");
      const failed: SetupScanResult = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
      onResult?.(failed);
      new Notice(this.t("notice.openFileFailed", { title: this.t("view.books") }));
      return failed;
    }
    this.index = result.index;
    this.saveIndexToDisk();
    if (this.statusBarItem) {
      this.statusBarItem.setText("");
    }
    const unmatchedNote = result.unmatched.length
      ? this.t("notice.scanDoneUnmatched", { count: result.unmatched.length })
      : "";
    new Notice(
      this.t("notice.scanDone", { added: result.added, updated: result.updated, unmatched: unmatchedNote })
    );
    await this.refreshView();
    const completed: SetupScanResult = {
      status: classifyBookScanStatus(
        result.unmatched.length,
        Object.values(result.index.entries).map((record) => record.enrichmentState)
      ),
      indexed: result.added + result.updated,
      message: unmatchedNote,
    };
    onResult?.(completed);
    return completed;
  }

  async scanAudiobooks(onResult?: SetupScanCallback): Promise<SetupScanResult> {
    const libraryPath = this.settings.audiobookLibraryPath.trim();
    if (!libraryPath || !fs.existsSync(libraryPath) || !fs.statSync(libraryPath).isDirectory()) {
      new Notice(this.t("notice.noPath"));
      const result: SetupScanResult = { status: "skipped", error: this.t("notice.noPath") };
      onResult?.(result);
      return result;
    }
    if (!Platform.isDesktopApp) {
      new Notice(this.t("notice.desktopOnly"));
      const result: SetupScanResult = { status: "failed", error: this.t("notice.desktopOnly") };
      onResult?.(result);
      return result;
    }
    try {
      const catalogDir = this.settings.audiobookCatalogDir;
      this.audiobookIndex = buildLocalAudiobookIndex({
        libraryPath,
        catalogDir,
        previousIndex: this.audiobookIndex,
      });
      if (this.settings.fetchMetadata) {
        const metadataProvider = new MetadataProvider((url) =>
          withTimeout(requestUrl({ url, throw: false }), 15_000).then((res) => ({
            status: res.status,
            text: res.text,
            arrayBuffer: res.arrayBuffer,
          }))
        );
        const provider: AudiobookEnrichmentProvider = {
          fetchByTitleAuthor: async (title, author, language) => {
            const fetched = await metadataProvider.fetchByTitleAuthor(title, author, language);
            return fetched ? {
              ...fetched,
              publicMetadataSources: fetched.sourceUrl ? [fetched.sourceUrl] : [],
            } : null;
          },
          downloadCover: (metadata) => metadata.coverUrl
            ? metadataProvider.downloadCover(metadata.coverUrl)
            : null,
        };
        const enriched = await enrichAudiobooks(
          Object.values(this.audiobookIndex.entries),
          provider,
          {
            maxRecords: this.settings.maxBooksPerRun,
            coversDir: this.resolveVaultPath(path.posix.join(catalogDir, "covers")),
          }
        );
        this.audiobookIndex.entries = Object.fromEntries(enriched.map((record) => [record.id, record]));
      }
      writeAudiobookCatalog(
        this.audiobookIndex,
        this.resolveVaultPath(catalogDir),
        this.index,
        { language: this.language, technicalExpanded: this.settings.technicalDetailsExpanded }
      );
      new Notice(this.t("notice.scanDone", { added: Object.keys(this.audiobookIndex.entries).length, updated: 0, unmatched: "" }));
      await this.refreshView();
      const completed: SetupScanResult = {
        status: "success",
        indexed: Object.keys(this.audiobookIndex.entries).length,
      };
      onResult?.(completed);
      return completed;
    } catch (error) {
      new Notice(this.t("notice.openFileFailed", { title: "Audiobooks" }));
      this.logDebug(`scanAudiobooks:error=${String(error).slice(0, 400)}`);
      const failed: SetupScanResult = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
      onResult?.(failed);
      return failed;
    }
  }

  async saveManualAudiobook(input: ManualAudiobookInput): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice(this.t("notice.desktopOnly"));
      return;
    }
    const result = upsertManualAudiobook(
      this.audiobookIndex,
      input,
      this.settings.audiobookCatalogDir
    );
    this.audiobookIndex = result.index;
    const catalogDir = this.resolveVaultPath(this.settings.audiobookCatalogDir);
    fs.mkdirSync(catalogDir, { recursive: true });
    writeAudiobookCatalog(
      result.index,
      catalogDir,
      this.index,
      { language: this.language, technicalExpanded: this.settings.technicalDetailsExpanded }
    );
    new Notice(this.t("manual.saved", { title: result.record.title }));
    await this.refreshView();
  }

  openManualAudiobookModal(): void {
    new ManualAudiobookModal(this.app, this).open();
  }

  async convertNextBooks(): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice(this.t("notice.convertDesktopOnly"));
      return;
    }
    const candidates = this.getBooks()
      .filter((book) => book.format === "epub" && !book.markdownPath)
      .slice(0, this.settings.maxBooksPerRun);
    if (candidates.length === 0) {
      new Notice(this.t("notice.noEpubToConvert"));
      return;
    }
    const libraryPath = this.settings.libraryPath;
    const outputDir = this.resolveVaultPath(this.settings.markdownDir);
    for (const book of candidates) {
      try {
        const input = path.join(libraryPath, book.file);
        const result = await convertEpubToMarkdown(input, outputDir);
        book.markdownPath = `${this.settings.markdownDir}/${path.relative(outputDir, result.outputPath).split(path.sep).join("/")}`;
        await this.updateCatalogRecord(book);
        new Notice(this.t("notice.converted", { title: book.title }));
      } catch (error) {
        new Notice(this.t("notice.convertFailed", { title: book.title }));
      }
    }
    this.saveIndexToDisk();
    await this.refreshView();
  }

  async generateNextWikis(): Promise<void> {
    if (!this.isPro()) {
      new Notice(this.t("notice.wikiPro"));
      this.startUpgrade();
      return;
    }
    if (!Platform.isDesktopApp) {
      new Notice(this.t("notice.wikiDesktopOnly"));
      return;
    }
    const candidates = this.getBooks()
      .filter((book) => book.wikiStatus !== "done" && (
        book.markdownPath || hasMetadataWikiSource(book, this.settings.reviewsEnabled)
      ))
      .slice(0, this.settings.maxBooksPerRun);
    if (candidates.length === 0) {
      new Notice(this.t("notice.noWikiCandidates"));
      return;
    }
    const wikiDir = this.resolveVaultPath(this.settings.wikiDir);
    const budget: BudgetState = { spentCents: 0, limitCents: this.settings.budgetCents };
    const pipeline = new AiPipeline(this.settings, wikiDir, budget, this.language);
    for (const book of candidates) {
      try {
        const markdownPath = book.markdownPath
          ? resolveContainedPath(this.resolveVaultPath("."), book.markdownPath)
          : null;
        const hasMarkdown = Boolean(markdownPath && fs.existsSync(markdownPath) && fs.readFileSync(markdownPath, "utf8").trim());
        const result = hasMarkdown
          ? await pipeline.generateWiki(book, markdownPath!)
          : buildMetadataWiki(book, this.settings.wikiDir, this.language, this.settings.reviewsEnabled);
        for (const page of result.pages) {
          const absolute = resolveContainedPath(this.resolveVaultPath("."), page.file);
          const relativeToWiki = absolute ? path.relative(wikiDir, absolute) : "..";
          if (!absolute || relativeToWiki === ".." || relativeToWiki.startsWith(".." + path.sep) || path.isAbsolute(relativeToWiki)) {
            throw new Error("Wiki path escapes the configured wiki directory");
          }
          fs.mkdirSync(path.dirname(absolute), { recursive: true });
          const footer = [
            "",
            "---",
            "",
            `- [[${catalogLinkTarget(catalogFileName(book), this.settings.catalogDir)}|Katalog: ${book.title}]]`,
            ...book.related
              .map((hash) => {
                const related = this.getBookByHash(hash);
                return related
                  ? `- [[${catalogLinkTarget(catalogFileName(related), this.settings.catalogDir)}|${related.title}]]`
                  : "";
              })
              .filter(Boolean)
              .slice(0, 6),
          ].join("\n");
          fs.writeFileSync(absolute, `${page.content.trim()}\n${footer}\n`, "utf8");
        }
        book.wikiStatus = "done";
        book.wikiPath = result.pages[result.pages.length - 1]?.file || "";
        await this.updateCatalogRecord(book);
        new Notice(
          this.t("notice.wikiDone", {
            title: book.title,
            tokens: result.tokens,
            cost: result.costCents,
          })
        );
      } catch (error) {
        book.wikiStatus = error instanceof Error && error.message.startsWith("Budget erreicht") ? "queued" : "failed";
        new Notice(this.t("notice.wikiFailed", { title: book.title }));
      }
    }
    this.saveIndexToDisk();
    await this.buildWikiIndexCommand();
    await this.refreshView();
  }

  async fetchMissingCovers(): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice(this.t("notice.desktopOnly"));
      return;
    }
    const missing = this.getBooks().filter((book) => !book.cover);
    if (missing.length === 0) {
      new Notice(this.t("notice.coverBackfillNoMissing"));
      return;
    }
    new Notice(this.t("notice.coverBackfillStart", { count: missing.length }));
    const provider = new MetadataProvider((url) =>
      requestUrl({ url, throw: false }).then((res) => ({
        status: res.status,
        text: res.text,
        arrayBuffer: res.arrayBuffer,
      }))
    );
    const coversDir = this.resolveVaultPath(this.settings.coversDir);
    const catalogDir = this.resolveVaultPath(this.settings.catalogDir);
    const titles: Record<string, string> = {};
    const catalogPaths: Record<string, string> = {};
    for (const book of this.getBooks()) {
      titles[book.hash] = book.title;
      catalogPaths[book.hash] = catalogFileName(book);
    }
    const result = await backfillMissingCovers({
      books: missing,
      provider,
      coversDir,
      catalogDir,
      wikiDir: this.settings.wikiDir,
      language: this.language,
      titles,
      catalogPaths,
      concurrency: 5,
      onProgress: (done, total) => {
        if (this.statusBarItem) {
          this.statusBarItem.setText(this.t("notice.coverBackfillProgress", { done, total }));
        }
        if (done % 25 === 0 || done === total) {
          new Notice(this.t("notice.coverBackfillProgress", { done, total }));
        }
      },
    });
    writeAuthorProfiles(
      this.getBooks(),
      this.resolveVaultPath(path.posix.join(this.settings.catalogDir, "authors")),
      this.language,
      this.settings.catalogDir
    );
    for (const book of missing) {
      if (book.cover) await this.updateCatalogRecord(book);
    }
    this.saveIndexToDisk();
    if (this.statusBarItem) {
      this.statusBarItem.setText("");
    }
    new Notice(
      this.t("notice.coverBackfillDone", {
        added: result.added,
        skipped: result.skipped,
      })
    );
    await this.refreshView();
  }

  async generateAiCovers(): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice(this.t("notice.desktopOnly"));
      return;
    }
    if (!this.settings.openAiApiKey) {
      new Notice(this.t("notice.aiCoversNeedKey"));
      return;
    }
    const missing = this.getBooks()
      .filter((book) => !book.cover && hasUsableCoverIdentity(book))
      .slice(0, Math.max(this.settings.maxBooksPerRun, AI_COVER_GRID.batchSize));
    if (missing.length === 0) {
      new Notice(this.t("notice.coverBackfillNoMissing"));
      return;
    }
    const batchSize = AI_COVER_GRID.batchSize;
    const processable = missing.slice(0, missing.length - (missing.length % batchSize));
    if (processable.length === 0) {
      new Notice("Für den 16er-Cover-Batch fehlen geprüfte Titel-/Autoren-Metadaten.");
      return;
    }
    new Notice(
      this.t("notice.aiCoversStart", {
        count: processable.length,
        batch: batchSize,
      })
    );
    const coversDir = this.resolveVaultPath(this.settings.coversDir);
    const catalogDir = this.resolveVaultPath(this.settings.catalogDir);
    const titles: Record<string, string> = {};
    const catalogPaths: Record<string, string> = {};
    for (const book of this.getBooks()) {
      titles[book.hash] = book.title;
      catalogPaths[book.hash] = catalogFileName(book);
    }
    writeAuthorProfiles(
      this.getBooks(),
      this.resolveVaultPath(path.posix.join(this.settings.catalogDir, "authors")),
      this.language,
      this.settings.catalogDir
    );
    this.saveIndexToDisk();
    let added = 0;
    let failed = 0;
    let costCents = 0;
    const manifestDir = path.join(catalogDir, "ai-cover-batches");
    fs.mkdirSync(manifestDir, { recursive: true });
    for (let offset = 0; offset < processable.length; offset += batchSize) {
      const batch = processable.slice(offset, offset + batchSize);
      const batchId = `batch-${new Date().toISOString().replace(/[:.]/g, "-")}-${String(offset / batchSize + 1).padStart(3, "0")}`;
      const manifestPath = path.join(manifestDir, `${batchId}.json`);
      const manifest = createCoverBatchManifest(batchId, batch, this.language);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
      try {
        const prompt = buildCoverSheetPrompt(batch, this.language);
        const sheet = await generateCoverSheet(
          {
            openAiApiKey: this.settings.openAiApiKey,
            model: this.settings.aiCoverModel,
            size: this.settings.aiCoverSize,
            batchSize,
          },
          prompt
        );
        costCents += sheet.costCents;
        manifest.status = "generated";
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
        const tiles = await sliceCoverSheet(sheet.buffer, AI_COVER_GRID.cols, AI_COVER_GRID.rows);
        if (tiles.length !== batchSize) throw new Error("AI-Cover-Sheet hat nicht 16 Kacheln geliefert.");
        fs.mkdirSync(coversDir, { recursive: true });
        for (let i = 0; i < batch.length; i++) {
          const book = batch[i];
          const coverFile = `${book.hash}.jpg`;
          fs.writeFileSync(path.join(coversDir, coverFile), tiles[i]);
          book.cover = coverFile;
          added += 1;
          await this.writeBookCatalogSafely(
            book,
            renderCatalogRecord(book, {
              language: this.language,
              wikiDir: this.settings.wikiDir,
              coversDir: this.settings.coversDir,
              titles,
              catalogPaths,
              topicsDir: path.posix.join(this.settings.catalogDir, "topics"),
              authorsDir: path.posix.join(this.settings.catalogDir, "authors"),
            })
          );
        }
        manifest.status = "assigned";
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
      } catch (error) {
        manifest.status = "failed";
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
        failed += batch.length;
        new Notice(
          this.t("notice.aiCoversFailed", {
            message: String(error).slice(0, 200),
          })
        );
      }
    }
    this.saveIndexToDisk();
    new Notice(
      this.t("notice.aiCoversDone", {
        added,
        failed,
      })
    );
    await this.refreshView();
  }

  async buildWikiIndexCommand(): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice(this.t("notice.desktopOnly"));
      return;
    }
    const wikiDir = this.resolveVaultPath(this.settings.wikiDir);
    const content = buildWikiIndex(
      this.getBooks(),
      this.settings.wikiDir,
      this.language,
      this.settings.catalogDir
    );
    fs.mkdirSync(wikiDir, { recursive: true });
    fs.writeFileSync(path.join(wikiDir, "index.md"), content, "utf8");
    new Notice(this.t("notice.wikiIndexDone"));
  }

  async reRenderCatalog(): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice(this.t("notice.desktopOnly"));
      return;
    }
    const catalogDir = this.resolveVaultPath(this.settings.catalogDir);
    const books = this.getBooks();
    const refreshed = refreshCatalogPaths(books);
    archiveReplacedCatalogNotes(catalogDir, refreshed.replacements);
    const titles: Record<string, string> = Object.fromEntries(
      books.map((book) => [book.hash, book.title])
    );
    const { catalogPaths } = refreshed;
    for (const book of books) {
      const target = await this.reserveCatalogNotePath(book);
      catalogPaths[book.hash] = path.posix.basename(target);
    }
    if (refreshed.changed > 0) this.saveIndexToDisk();
    writeBookTopicMocs(
      books,
      this.resolveVaultPath(path.posix.join(this.settings.catalogDir, "topics")),
      this.language,
      this.settings.catalogDir
    );
    writeAuthorProfiles(
      books,
      this.resolveVaultPath(path.posix.join(this.settings.catalogDir, "authors")),
      this.language,
      this.settings.catalogDir
    );
    this.saveIndexToDisk();
    let count = 0;
    for (const book of books) {
      await this.writeBookCatalogSafely(
        book,
        renderCatalogRecord(book, {
          language: this.language,
          wikiDir: this.settings.wikiDir,
          coversDir: this.settings.coversDir,
          titles,
          catalogPaths,
          amazonUrlTemplate: this.settings.amazonUrlTemplate,
          goodreadsUrlTemplate: this.settings.goodreadsUrlTemplate,
          topicsDir: path.posix.join(this.settings.catalogDir, "topics"),
          authorsDir: path.posix.join(this.settings.catalogDir, "authors"),
        })
      );
      count += 1;
    }
    new Notice(this.t("notice.rerenderDone", { count }));
    await this.refreshView();
  }

  async enrichMichaelHudsonPilot(): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice(this.t("notice.desktopOnly"));
      return;
    }
    const candidates = this.getBooks().filter(isMichaelHudsonPilotBook).slice(0, 2);
    if (candidates.length === 0) {
      new Notice(this.language === "de" ? "Keine Michael-Hudson-Pilotbücher gefunden." : "No Michael Hudson pilot books found.");
      return;
    }
    const provider = new MetadataProvider((url) =>
      requestUrl({ url, throw: false }).then((res) => ({ status: res.status, text: res.text, arrayBuffer: res.arrayBuffer }))
    );
    const settled = await Promise.allSettled(candidates.map(async (book) => {
      const fetched = book.isbn
        ? await provider.fetchByIsbn(book.isbn, book.language)
        : await provider.fetchByTitleAuthor(book.title, book.author, book.language);
      return {
        hash: book.hash,
        record: fetched
          ? applyFetchedMetadata(book, fetched)
          : applyMichaelHudsonPilotIdentity({ ...book, enrichmentState: "partial" }),
      };
    }));
    const results = settled.map((result, index) => result.status === "fulfilled"
      ? result.value
      : {
        hash: candidates[index].hash,
        record: { ...candidates[index], enrichmentState: "failed" as const },
      });
    for (const result of results) {
      this.index.entries[result.hash] = result.record;
    }
    const pilotAuthorIds = new Set(results.map((result) => authorProfileId(result.record)));
    writeAuthorProfiles(
      this.getBooks().filter((candidate) => pilotAuthorIds.has(authorProfileId(candidate))),
      this.resolveVaultPath(path.posix.join(this.settings.catalogDir, "authors")),
      this.language,
      this.settings.catalogDir
    );
    this.saveIndexToDisk();
    for (const result of results) {
      await this.writeBookCatalogSafely(result.record, this.renderBookCatalog(result.record));
    }
    await this.refreshView();
    const counts = results.reduce((summary, result) => {
      const state = result.record.enrichmentState || "success";
      if (state === "success") summary.success += 1;
      else if (state === "failed") summary.failed += 1;
      else summary.review += 1;
      return summary;
    }, { success: 0, review: 0, failed: 0 });
    new Notice(this.language === "de"
      ? `Pilot abgeschlossen: ${counts.success} erfolgreich, ${counts.review} teilweise oder zu prüfen, ${counts.failed} fehlgeschlagen.`
      : `Pilot finished: ${counts.success} successful, ${counts.review} partial or needs review, ${counts.failed} failed.`);
  }

  async repairMetadataText(): Promise<void> {
    if (!Platform.isDesktopApp) {
      new Notice(this.t("notice.desktopOnly"));
      return;
    }
    try {
      let changed = 0;
      for (const [hash, record] of Object.entries(this.index.entries)) {
        const repaired = normalizeBookRecord(record);
        if (JSON.stringify(repaired) !== JSON.stringify(record)) changed += 1;
        this.index.entries[hash] = repaired;
      }

      const catalogDir = this.resolveVaultPath(this.settings.catalogDir);
      const books = this.getBooks();
      for (const book of books) {
        const related = computeRelatedBooks(book, books);
        if (JSON.stringify(related) !== JSON.stringify(book.related)) changed += 1;
        book.related = related;
      }
      const refreshed = refreshCatalogPaths(books);
      changed += refreshed.changed;
      archiveReplacedCatalogNotes(catalogDir, refreshed.replacements);
      const titles: Record<string, string> = Object.fromEntries(
        books.map((book) => [book.hash, book.title])
      );
      const { catalogPaths } = refreshed;
      for (const book of books) {
        const target = await this.reserveCatalogNotePath(book);
        catalogPaths[book.hash] = path.posix.basename(target);
      }
      writeBookTopicMocs(
        books,
        this.resolveVaultPath(path.posix.join(this.settings.catalogDir, "topics")),
        this.language,
        this.settings.catalogDir
      );
      writeAuthorProfiles(
        books,
        this.resolveVaultPath(path.posix.join(this.settings.catalogDir, "authors")),
        this.language,
        this.settings.catalogDir
      );
      this.saveIndexToDisk();
      for (const book of books) {
        await this.writeBookCatalogSafely(
          book,
          renderCatalogRecord(book, {
            language: this.language,
            wikiDir: this.settings.wikiDir,
            coversDir: this.settings.coversDir,
            titles,
            catalogPaths,
            amazonUrlTemplate: this.settings.amazonUrlTemplate,
            goodreadsUrlTemplate: this.settings.goodreadsUrlTemplate,
            topicsDir: path.posix.join(this.settings.catalogDir, "topics"),
            authorsDir: path.posix.join(this.settings.catalogDir, "authors"),
          })
        );
      }

      if (this.audiobookIndex) {
        for (const [id, record] of Object.entries(this.audiobookIndex.entries)) {
          const repaired = normalizeAudiobookRecord(record);
          if (JSON.stringify(repaired) !== JSON.stringify(record)) changed += 1;
          this.audiobookIndex.entries[id] = repaired;
        }
        writeAudiobookCatalog(
          this.audiobookIndex,
          this.resolveVaultPath(this.settings.audiobookCatalogDir),
          this.index,
          { language: this.language, technicalExpanded: this.settings.technicalDetailsExpanded }
        );
      }

      this.saveIndexToDisk();
      new Notice(
        changed > 0
          ? this.t("notice.repairMetadataDone", { count: changed })
          : this.t("notice.repairMetadataNoIssues")
      );
      await this.refreshView();
    } catch (error) {
      new Notice(this.t("notice.repairMetadataFailed", { message: String(error).slice(0, 160) }));
    }
  }

  async startUpgrade(): Promise<void> {
    if (this.isPro()) {
      new Notice(this.t("notice.proActive"));
      return;
    }
    if (this.settings.checkoutEndpoint) {
      try {
        const res = await requestUrl({ url: this.settings.checkoutEndpoint, method: "POST", throw: false });
        if (res.status !== 200) {
          new Notice(this.t("notice.checkoutUnreachable"));
          return;
        }
        const session = JSON.parse(res.text);
        if (session.url && isValidHttpUrl(session.url)) {
          window.open(session.url, "_blank", "noopener,noreferrer");
          return;
        }
      } catch {
        new Notice(this.t("notice.checkoutEndpointUnreachable"));
        return;
      }
    }
    if (this.settings.stripePaymentLink && isValidHttpUrl(this.settings.stripePaymentLink)) {
      window.open(this.settings.stripePaymentLink, "_blank", "noopener,noreferrer");
      return;
    }
    new Notice(this.t("notice.checkoutMissing"));
  }

  private resolveVaultPath(relative: string): string {
    const adapter = this.app.vault.adapter as unknown as { getBasePath: () => string };
    const vaultPath = adapter.getBasePath();
    return path.join(vaultPath, relative);
  }

  private async openVaultNoteVisible(notePath: string): Promise<void> {
    let file = this.app.vault.getAbstractFileByPath(notePath);
    for (let attempt = 0; !(file instanceof TFile) && attempt < 10; attempt += 1) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
      file = this.app.vault.getAbstractFileByPath(notePath);
    }
    if (!(file instanceof TFile)) throw new Error("Vault note is unavailable");
    const existing = this.app.workspace.getLeavesOfType("markdown")
      .find((leaf) => leaf.getViewState().state?.file === notePath);
    const leaf = existing || this.app.workspace.getLeaf("tab");
    if (!existing) await leaf.openFile(file, { active: true });
    await this.app.workspace.revealLeaf(leaf);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  private async updateCatalogRecord(book: BookRecord): Promise<void> {
    const titles: Record<string, string> = {};
    const catalogPaths: Record<string, string> = {};
    for (const candidate of this.getBooks()) {
      titles[candidate.hash] = candidate.title;
      catalogPaths[candidate.hash] = catalogFileName(candidate);
    }
    writeBookTopicMocs(
      this.getBooks(),
      this.resolveVaultPath(path.posix.join(this.settings.catalogDir, "topics")),
      this.language,
      this.settings.catalogDir
    );
    const content = this.renderBookCatalog(book, titles, catalogPaths);
    await this.writeBookCatalogSafely(book, content);
  }

  private async reserveCatalogNotePath(book: BookRecord): Promise<string> {
    const directory = this.settings.catalogDir.replace(/^\/+|\/+$/g, "");
    const preferred = path.posix.join(directory, catalogFileName(book));
    const target = await resolveGeneratedNoteTarget(this.app.vault.adapter, preferred, "book");
    book.catalogPath = path.posix.basename(target.path);
    return target.path;
  }

  private async writeBookCatalogSafely(book: BookRecord, content: string): Promise<void> {
    const notePath = await this.reserveCatalogNotePath(book);
    await this.app.vault.adapter.write(notePath, content);
  }

  private renderBookCatalog(
    book: BookRecord,
    titles: Record<string, string> = Object.fromEntries(this.getBooks().map((candidate) => [candidate.hash, candidate.title])),
    catalogPaths: Record<string, string> = Object.fromEntries(this.getBooks().map((candidate) => [candidate.hash, catalogFileName(candidate)]))
  ): string {
    return renderCatalogRecord(book, {
      language: this.language,
      wikiDir: this.settings.wikiDir,
      coversDir: this.settings.coversDir,
      titles,
      catalogPaths,
      amazonUrlTemplate: this.settings.amazonUrlTemplate,
      goodreadsUrlTemplate: this.settings.goodreadsUrlTemplate,
      topicsDir: path.posix.join(this.settings.catalogDir, "topics"),
      authorsDir: path.posix.join(this.settings.catalogDir, "authors"),
    });
  }

  private collapseCatalogPropertiesOnce(filePath: string): void {
    if (this.propertiesCollapsedThisSession.has(filePath)) return;
    let attempts = 0;
    const attempt = (): void => {
      attempts += 1;
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view || view.file?.path !== filePath) {
        if (attempts < 8) window.setTimeout(attempt, 125);
        return;
      }
      if (collapseGeneratedNoteProperties(view.containerEl)) {
        if (this.propertiesCollapsedThisSession.size >= 256) {
          const oldest = this.propertiesCollapsedThisSession.values().next().value as string | undefined;
          if (oldest) this.propertiesCollapsedThisSession.delete(oldest);
        }
        this.propertiesCollapsedThisSession.add(filePath);
      } else if (attempts < 8) {
        window.setTimeout(attempt, 125);
      }
    };
    window.setTimeout(attempt, 60);
  }

  private loadIndexFromDisk(): void {
    try {
      const absolute = path.join(this.resolveVaultPath(this.settings.catalogDir), ".book-library-index.json");
      if (fs.existsSync(absolute)) {
        const loaded = JSON.parse(fs.readFileSync(absolute, "utf8")) as BookIndex;
        this.index = {
          ...loaded,
          entries: Object.fromEntries(Object.entries(loaded.entries || {}).map(([hash, record]) => [
            hash,
            normalizeBookRecord(record),
          ])),
        };
      }
    } catch {
      this.index = { version: CATALOG_VERSION, generatedAt: "", entries: {} };
    }
  }

  private loadAudiobookIndexFromDisk(): void {
    try {
      const absolute = path.join(this.resolveVaultPath(this.settings.audiobookCatalogDir), ".book-library-audiobook-index.json");
      if (fs.existsSync(absolute)) {
        this.audiobookIndex = JSON.parse(fs.readFileSync(absolute, "utf8")) as AudiobookIndex;
        this.audiobookIndex = normalizeAudiobookIndex(this.audiobookIndex);
      }
    } catch {
      this.audiobookIndex = null;
    }
  }

  private saveIndexToDisk(): void {
    const absolute = path.join(this.resolveVaultPath(this.settings.catalogDir), ".book-library-index.json");
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, JSON.stringify(this.index, null, 2), "utf8");
  }

  private async refreshView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(BOOK_LIBRARY_VIEW);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof BookLibraryView) {
        await view.render();
      }
    }
  }

  async loadSettings(): Promise<void> {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    for (const [key, value] of Object.entries(this.settings)) {
      if ((value === null || value === undefined) && key in DEFAULT_SETTINGS) {
        (this.settings as unknown as Record<string, unknown>)[key] = DEFAULT_SETTINGS[key as keyof LibrarySettings];
      }
    }
    this.settings.libraryUiState = normalizeLibraryUiState(saved?.libraryUiState ?? DEFAULT_SETTINGS.libraryUiState);
    await this.saveSettings();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Metadata request timed out")), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}
