import { App, Modal, Setting } from "obsidian";
import * as fs from "fs";
import type BookLibrary from "./main";
import type { TranslationKey } from "./i18n";

export type SetupScanStatus = "success" | "partial" | "ambiguous" | "failed" | "skipped";

export interface SetupScanResult {
  status: SetupScanStatus;
  indexed?: number;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

export type SetupScanCallback = (result: SetupScanResult) => void;

export function classifyBookScanStatus(
  unmatchedCount: number,
  enrichmentStates: Array<string | undefined>
): SetupScanStatus {
  if (unmatchedCount > 0 || enrichmentStates.some((state) => state === "failed" || state === "partial")) {
    return "partial";
  }
  if (enrichmentStates.some((state) => state === "ambiguous")) return "ambiguous";
  return "success";
}

export function isReadableDirectory(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return false;
  try {
    if (typeof fs.statSync !== "function") return true;
    const stat = fs.statSync(candidate);
    if (!stat.isDirectory()) return false;
    if (typeof fs.accessSync === "function") fs.accessSync(candidate, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function isSetupScanStatus(value: unknown): value is SetupScanStatus {
  return value === "success" || value === "partial" || value === "ambiguous" || value === "failed" || value === "skipped";
}

export function normalizeScanResult(value: unknown, fallback: SetupScanResult = { status: "success" }): SetupScanResult {
  if (typeof value === "string") {
    return isSetupScanStatus(value) ? { status: value } : { status: "failed", error: value };
  }
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    if (isSetupScanStatus(candidate.status)) return { ...candidate, status: candidate.status } as SetupScanResult;
    if (candidate.error || candidate.message) {
      return { ...candidate, status: "failed", error: String(candidate.error ?? candidate.message) } as SetupScanResult;
    }
  }
  if (value === false) return { status: "failed" };
  return fallback;
}

export function resolveScanResult(returned: unknown, callbackResult: unknown): SetupScanResult {
  if (callbackResult !== undefined) return normalizeScanResult(callbackResult, { status: "failed" });
  if (returned !== undefined) return normalizeScanResult(returned, { status: "failed" });
  return { status: "success" };
}

export interface SetupSummary {
  books: number;
  booksWithCovers: number;
  audiobooks: number;
  audiobooksWithCovers: number;
  sourceLinks: number;
  relatedTopics: number;
}

export function buildSetupSummary(
  books: Array<{ cover?: string; related?: string[]; tags?: string[] }>,
  audiobooks: Array<{
    cover?: string;
    relatedTopicLinks?: string[];
    sourceLink?: string | null;
    privateMegaUrl?: string | null;
    publicLink?: string | null;
    legacyPrivateUrl?: string | null;
    legacyPublicLink?: string | null;
  }>
): SetupSummary {
  const hasSourceLink = (audiobook: {
    sourceLink?: string | null;
    privateMegaUrl?: string | null;
    publicLink?: string | null;
    legacyPrivateUrl?: string | null;
    legacyPublicLink?: string | null;
  }): boolean => Boolean(
    audiobook.sourceLink ??
    audiobook.privateMegaUrl ??
    audiobook.publicLink ??
    audiobook.legacyPrivateUrl ??
    audiobook.legacyPublicLink
  );
  return {
    books: books.length,
    booksWithCovers: books.filter((book) => Boolean(book.cover)).length,
    audiobooks: audiobooks.length,
    audiobooksWithCovers: audiobooks.filter((audiobook) => Boolean(audiobook.cover)).length,
    sourceLinks: audiobooks.filter(hasSourceLink).length,
    relatedTopics: books.filter((book) => (book.related?.length || 0) > 0 || (book.tags?.length || 0) > 0).length +
      audiobooks.filter((audiobook) => (audiobook.relatedTopicLinks?.length || 0) > 0).length,
  };
}

export class SetupWizardModal extends Modal {
  private plugin: BookLibrary;
  private step: 0 | 1 | 2 = 0;
  private running = false;
  private finished = false;
  private status = "";
  private summary: SetupSummary | null = null;
  private error = "";
  private pathError = "";
  private scanResults: SetupScanResult[] = [];

  constructor(app: App, plugin: BookLibrary) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("book-library-setup");
    contentEl.createEl("h2", { text: this.t("setup.title") });
    const steps = contentEl.createDiv({ cls: "book-library-setup-steps" });
    ["setup.folders", "setup.options", "setup.review"].forEach((key, index) => {
      const item = steps.createDiv({ cls: "book-library-setup-step" });
      item.toggleClass("is-active", this.step === index && !this.finished);
      item.toggleClass("is-done", this.step > index || this.finished);
      item.setText(this.t(key as TranslationKey));
    });
    if (this.step === 0) this.renderFolders(contentEl);
    else if (this.step === 1) this.renderOptions(contentEl);
    else this.renderRun(contentEl);
  }

  private renderFolders(parent: HTMLElement): void {
    if (this.plugin.settings.libraryPath.trim() && !isReadableDirectory(this.plugin.settings.libraryPath)) {
      this.pathError = this.t("setup.invalidBooksFolder");
    } else if (this.plugin.settings.audiobookLibraryPath.trim() && !isReadableDirectory(this.plugin.settings.audiobookLibraryPath)) {
      this.pathError = this.t("setup.invalidAudiobooksFolder");
    } else {
      this.pathError = "";
    }
    parent.createDiv({ text: this.t("setup.welcome"), cls: "book-library-setup-lede" });
    this.folderRow(parent, this.t("setup.booksFolder"), this.plugin.settings.libraryPath, async (value) => {
      if (!isReadableDirectory(value)) {
        this.pathError = this.t("setup.invalidBooksFolder");
        this.render();
        return;
      }
      this.pathError = "";
      this.plugin.settings.libraryPath = value;
      await this.plugin.saveSettings();
      this.render();
    });
    this.folderRow(parent, this.t("setup.audiobooksFolder"), this.plugin.settings.audiobookLibraryPath, async (value) => {
      if (value.trim() && !isReadableDirectory(value)) {
        this.pathError = this.t("setup.invalidAudiobooksFolder");
        this.render();
        return;
      }
      this.pathError = "";
      this.plugin.settings.audiobookLibraryPath = value;
      await this.plugin.saveSettings();
      this.render();
    });
    parent.createDiv({ text: this.t("setup.privacy"), cls: "book-library-muted" });
    if (this.pathError) parent.createDiv({ text: this.pathError, cls: "book-library-error" });
    this.navigation(parent, true, false);
  }

  private folderRow(parent: HTMLElement, label: string, value: string, onSelect: (value: string) => Promise<void>): void {
    const row = parent.createDiv({ cls: "book-library-setup-row" });
    const info = row.createDiv({ cls: "book-library-setup-folder" });
    info.createDiv({ text: label, cls: "book-library-modal-label" });
    info.createDiv({
      text: value ? `${this.t("setup.selected")}: ${value}` : this.t("setup.notSelected"),
      cls: "book-library-modal-value",
    });
    const choose = row.createEl("button", { text: this.t("setup.chooseFolder") });
    choose.disabled = this.running;
    choose.addEventListener("click", async () => {
      const selected = await this.plugin.chooseDirectory();
      if (selected) await onSelect(selected);
    });
  }

  private renderOptions(parent: HTMLElement): void {
    new Setting(parent).setName(this.t("setup.language")).addDropdown((dropdown) => {
      dropdown.addOption("auto", "Auto").addOption("en", "English").addOption("de", "Deutsch")
        .setValue(this.plugin.settings.language).onChange(async (value) => {
          this.plugin.settings.language = value as typeof this.plugin.settings.language;
          await this.plugin.saveSettings();
        });
    });
    new Setting(parent).setName(this.t("setup.detailsExpanded"))
      .setDesc(this.t("settings.detailsExpandedDesc")).addToggle((toggle) =>
      toggle.setValue(this.plugin.settings.detailsExpanded).onChange(async (value) => {
        this.plugin.settings.detailsExpanded = value;
        await this.plugin.saveSettings();
      })
    );
    new Setting(parent).setName(this.t("setup.technicalDetailsExpanded"))
      .setDesc(this.t("settings.technicalDetailsExpandedDesc")).addToggle((toggle) =>
      toggle.setValue(this.plugin.settings.technicalDetailsExpanded).onChange(async (value) => {
        this.plugin.settings.technicalDetailsExpanded = value;
        await this.plugin.saveSettings();
      })
    );
    this.navigation(parent, false, true);
  }

  private renderRun(parent: HTMLElement): void {
    if (this.summary) {
      const box = parent.createDiv({ cls: "book-library-setup-summary" });
      box.createEl("h3", { text: this.t("setup.review") });
      this.summaryLine(box, "setup.booksIndexed", this.summary.books);
      this.summaryLine(box, "setup.coversComplete", `${this.summary.booksWithCovers + this.summary.audiobooksWithCovers}/${this.summary.books + this.summary.audiobooks}`);
      this.summaryLine(box, "setup.audiobooksIndexed", this.summary.audiobooks);
      this.summaryLine(box, "setup.sourceLinks", this.summary.sourceLinks);
      this.summaryLine(box, "setup.relatedTopics", this.summary.relatedTopics);
      this.scanResults.forEach((result) => {
        const key: TranslationKey = result.status === "success" ? "setup.scanSuccess" :
          result.status === "partial" ? "setup.scanPartial" :
            result.status === "ambiguous" ? "setup.scanAmbiguous" :
              result.status === "skipped" ? "setup.scanSkipped" : "setup.scanFailed";
        box.createDiv({ text: this.t(key), cls: `book-library-setup-result is-${result.status}` });
        if (result.error || (result.message && result.status !== "success")) {
          box.createDiv({ text: String(result.error ?? result.message), cls: "book-library-error" });
        }
      });
    } else {
      parent.createDiv({ text: this.status || this.t("setup.review"), cls: "book-library-setup-status" });
    }
    if (this.error) parent.createDiv({ text: this.error, cls: "book-library-error" });
    const actions = parent.createDiv({ cls: "book-library-setup-actions" });
    const back = actions.createEl("button", { text: this.t("setup.back") });
    back.disabled = this.running;
    back.addEventListener("click", () => {
      this.step = 1;
      this.render();
    });
    if (!this.finished) {
      const run = actions.createEl("button", { text: this.t("setup.run"), cls: "mod-cta" });
      run.disabled = this.running || !isReadableDirectory(this.plugin.settings.libraryPath) ||
        Boolean(this.plugin.settings.audiobookLibraryPath.trim() && !isReadableDirectory(this.plugin.settings.audiobookLibraryPath));
      run.addEventListener("click", () => void this.run());
    } else {
      const finish = actions.createEl("button", { text: this.t("setup.finish"), cls: "mod-cta" });
      finish.addEventListener("click", () => this.close());
    }
  }

  private summaryLine(parent: HTMLElement, key: TranslationKey, value: string | number): void {
    parent.createDiv({ text: this.t(key, { count: Number(value), covered: String(value).split("/")[0] || "0", total: String(value).split("/")[1] || "0" }), cls: "book-library-setup-result" });
  }

  private navigation(parent: HTMLElement, canNext: boolean, canBack: boolean): void {
    const actions = parent.createDiv({ cls: "book-library-setup-actions" });
    if (canBack) {
      const back = actions.createEl("button", { text: this.t("setup.back") });
      back.disabled = this.running;
      back.addEventListener("click", () => {
        this.step = 0;
        this.render();
      });
    }
    if (canNext) {
      const next = actions.createEl("button", { text: this.t("setup.next"), cls: "mod-cta" });
      next.disabled = !isReadableDirectory(this.plugin.settings.libraryPath) ||
        Boolean(this.plugin.settings.audiobookLibraryPath.trim() && !isReadableDirectory(this.plugin.settings.audiobookLibraryPath));
      next.addEventListener("click", () => {
        this.step = 1;
        this.render();
      });
    }
  }

  private async run(): Promise<void> {
    if (!isReadableDirectory(this.plugin.settings.libraryPath)) {
      this.error = this.t("setup.needsBookFolder");
      this.render();
      return;
    }
    if (this.plugin.settings.audiobookLibraryPath.trim() && !isReadableDirectory(this.plugin.settings.audiobookLibraryPath)) {
      this.error = this.t("setup.invalidAudiobooksFolder");
      this.render();
      return;
    }
    this.running = true;
    this.error = "";
    this.summary = null;
    this.scanResults = [];
    this.finished = false;
    try {
      this.status = this.t("setup.indexingBooks");
      this.render();
      const booksResult = await this.invokeScan(this.plugin.scanLibrary.bind(this.plugin));
      this.scanResults.push(booksResult);
      if (booksResult.status === "failed" || booksResult.status === "skipped") {
        this.error = booksResult.error || this.t("setup.scanRetry");
      }
      if (this.plugin.settings.audiobookLibraryPath.trim()) {
        this.status = this.t("setup.indexingAudiobooks");
        this.render();
        const audiobooksResult = await this.invokeScan(this.plugin.scanAudiobooks.bind(this.plugin));
        this.scanResults.push(audiobooksResult);
        if (audiobooksResult.status === "failed" || audiobooksResult.status === "skipped") {
          this.error = audiobooksResult.error || this.t("setup.scanRetry");
        }
      }
      this.summary = buildSetupSummary(this.plugin.getBooks(), Object.values(this.plugin.getAudiobooks()));
      this.finished = this.scanResults.length > 0 && this.scanResults.every((result) => result.status === "success");
    } catch (error) {
      this.error = String(error).slice(0, 240);
      this.scanResults.push({ status: "failed", error: this.error });
    } finally {
      this.running = false;
      this.render();
    }
  }

  private async invokeScan(method: (callback?: SetupScanCallback) => Promise<unknown> | unknown): Promise<SetupScanResult> {
    let callbackResult: unknown;
    const callback: SetupScanCallback = (result) => {
      callbackResult = result;
    };
    const returned = await method(callback);
    return resolveScanResult(returned, callbackResult);
  }

  private t(key: TranslationKey, params?: Record<string, string | number>): string {
    return this.plugin.t(key, params);
  }
}
