import { App, Modal } from "obsidian";
import type { AudiobookRecord, BookRecord } from "./types";
import { colorForString, formatBytes, humanizeSource, initials, isValidHttpUrl, normalizeDisplayText, ratingStars, slugify } from "./util";
import { amazonSearchDestination } from "./marketplace";
import type { TranslationKey } from "./i18n";

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

interface MediaDetailDependencies {
  t: Translate;
  getCoverUrl: (cover: string) => string;
  openFile: (media: BookRecord | AudiobookRecord) => void;
  openNote: (media: BookRecord | AudiobookRecord) => void;
  openAuthor?: (book: BookRecord) => void;
  revealFolder?: (book: BookRecord) => void;
  getBookByHash?: (hash: string) => BookRecord | undefined;
  openTopicLink?: (link: string) => void;
  technicalExpanded?: boolean;
  detailMode?: "product" | "minimal";
  reviewsEnabled?: boolean;
}

export function shouldRenderPublicReviews(
  detailMode: "product" | "minimal" | undefined,
  reviewsEnabled: boolean | undefined,
  audiobook: boolean
): boolean {
  return !audiobook && detailMode !== "minimal" && reviewsEnabled === true;
}

export type DetailSection = "glance" | "why-read" | "reviews" | "related" | "technical";

export interface DetailRatingPresentation {
  value?: number;
  count: number;
  source: string;
  status: "provider-reported" | "unverified" | "user-confirmed";
  url: string;
  unavailable: boolean;
}

export function detailRatingPresentations(record: BookRecord): DetailRatingPresentation[] {
  const ratings = record.sourceRatings?.length
    ? record.sourceRatings.map((rating) => ({ ...rating, unavailable: false }))
    : record.rating
      ? [{
        value: record.rating,
        count: record.ratingsCount || 0,
        source: record.enrichmentSource || record.source,
        status: "provider-reported" as const,
        url: "",
        unavailable: false,
      }]
      : [];
  if (ratings.some((rating) => rating.source === "amazon" && !rating.unavailable)) return ratings;
  const amazon = amazonSearchDestination(record);
  return [
    ...ratings,
    { count: 0, source: amazon.label, status: "unverified", url: amazon.url, unavailable: true } as const,
  ];
}

export function detailSectionOrder(productMode: boolean): DetailSection[] {
  return productMode
    ? ["why-read", "reviews", "related", "technical"]
    : ["glance", "related", "technical"];
}

export function conciseDetailSource(source: string): string {
  const full = humanizeSource(source).trim();
  const primary = full.split(/[;,]/, 1)[0].replace(/\s+\d{4}[\s-]\d{2}[\s-]\d{2}$/, "").trim();
  return primary.length > 52 ? `${primary.slice(0, 51).trimEnd()}…` : primary;
}

export class MediaDetailModal extends Modal {
  private media: BookRecord | AudiobookRecord;
  private deps: MediaDetailDependencies;
  private previousActiveElement: HTMLElement | null = null;
  private restoreFocusOnClose = true;

  constructor(app: App, media: BookRecord | AudiobookRecord, deps: MediaDetailDependencies) {
    super(app);
    this.media = media;
    this.deps = deps;
  }

  onOpen(): void {
    const audiobook = this.isAudiobook(this.media);
    const audioRecord = this.media as AudiobookRecord;
    const bookRecord = this.media as BookRecord;
    const title = normalizeDisplayText(this.media.title) || "?";
    const author = normalizeDisplayText(this.media.author) || this.t("view.unknownAuthor");
    const { contentEl } = this;
    const productMode = this.deps.detailMode !== "minimal";
    this.previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    contentEl.empty();
    contentEl.addClass("book-library-modal");
    const header = contentEl.createDiv({ cls: "book-library-modal-header" });
    const coverBox = header.createDiv({ cls: "book-library-modal-cover" });
    const renderPlaceholder = (): void => {
      const placeholder = coverBox.createDiv({ cls: "book-library-modal-placeholder" });
      placeholder.setText(initials(title));
      placeholder.style.setProperty("--book-library-cover-color", colorForString(title));
    };
    const coverUrl = this.media.cover ? this.deps.getCoverUrl(this.media.cover) : "";
    if (!coverUrl) {
      renderPlaceholder();
    } else {
      const img = coverBox.createEl("img", { cls: "book-library-modal-cover-img", attr: { alt: title } });
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", () => {
        img.remove();
        renderPlaceholder();
      }, { once: true });
      img.src = coverUrl;
    }
    const titleBox = header.createDiv({ cls: "book-library-modal-title-box" });
    titleBox.createEl("h2", { text: title, cls: "book-library-modal-title" });
    const authorProfileBook = audiobook ? this.matchedBookFor(audioRecord) : bookRecord;
    if (authorProfileBook && this.deps.openAuthor && normalizeDisplayText(this.media.author)) {
      const authorButton = titleBox.createEl("button", { text: author, cls: "book-library-modal-author is-button" });
      authorButton.addEventListener("click", () => this.finish(() => this.deps.openAuthor?.(authorProfileBook)));
    } else {
      titleBox.createDiv({ text: author, cls: "book-library-modal-author" });
    }
    this.renderRatingAndCategories(titleBox, audiobook);
    if (!audiobook && (bookRecord.wikiStatus === "done" || bookRecord.markdownPath)) {
      const badges = titleBox.createDiv({ cls: "book-library-modal-badges" });
      if (bookRecord.wikiStatus === "done") {
        badges.createSpan({ text: this.t("view.badgeWiki"), cls: "book-library-badge is-wiki" });
      }
      if (bookRecord.markdownPath) {
        badges.createSpan({ text: this.t("view.badgeMarkdown"), cls: "book-library-badge is-markdown" });
      }
    }

    const body = contentEl.createDiv({ cls: "book-library-modal-body" });
    const synopsis = normalizeDisplayText(audiobook ? audioRecord.synopsis : bookRecord.summary);
    if (synopsis) {
      const synopsisBox = body.createDiv({ cls: "book-library-modal-synopsis" });
      synopsisBox.createEl("h3", { text: this.t("catalog.synopsis") });
      synopsisBox.createDiv({ text: synopsis, cls: "book-library-modal-synopsis-text" });
    }
    if (!audiobook) {
      this.renderDescription(body, bookRecord);
    } else {
      const matchedBook = this.matchedBookFor(audioRecord);
      if (matchedBook) this.renderDescription(body, matchedBook, synopsis);
    }

    for (const section of detailSectionOrder(productMode)) {
      switch (section) {
        case "glance":
          this.renderAtAGlance(body, audiobook);
          break;
        case "why-read":
          this.renderWhyRead(body, audiobook, productMode);
          break;
        case "reviews":
          this.renderReviews(body, audiobook, productMode);
          break;
        case "related":
          this.renderRelated(body);
          break;
        case "technical":
          this.renderTechnical(body, audiobook);
          break;
      }
    }

    const actions = contentEl.createDiv({ cls: "book-library-modal-actions" });
    const openFile = actions.createEl("button", { text: audiobook ? this.t("view.openAudiobook") : this.t("view.detailsOpenFile"), cls: "mod-cta" });
    openFile.addEventListener("click", () => this.finish(() => this.deps.openFile(this.media)));
    const openNote = actions.createEl("button", { text: this.t("view.detailsOpenNote") });
    openNote.addEventListener("click", () => this.finish(() => this.deps.openNote(this.media)));
    if (!audiobook && this.deps.revealFolder) {
      const reveal = actions.createEl("button", { text: this.t("view.detailsRevealInFinder") });
      reveal.addEventListener("click", () => this.finish(() => this.deps.revealFolder?.(this.media as BookRecord)));
    }
    const close = actions.createEl("button", { text: this.t("view.detailsClose") });
    close.addEventListener("click", () => this.close());
    window.setTimeout(() => openFile.focus(), 0);
  }

  onClose(): void {
    this.contentEl.empty();
    if (this.restoreFocusOnClose) this.previousActiveElement?.focus();
    this.previousActiveElement = null;
    this.restoreFocusOnClose = true;
  }

  private renderTechnical(parent: HTMLElement, audiobook: boolean): void {
    const details = parent.createEl("details");
    if (this.deps.technicalExpanded) details.setAttribute("open", "");
    details.createEl("summary", { text: this.t("catalog.technicalDetails") });
    const rows = details.createDiv({ cls: "book-library-modal-technical" });
    if (audiobook) {
      const record = this.media as AudiobookRecord;
      this.row(rows, this.t("view.detailsFormat"), record.mediaType.toUpperCase());
      this.row(rows, this.t("view.detailsLanguage"), record.language);
      this.row(rows, this.t("view.detailsYear"), record.year);
      this.row(rows, this.t("view.detailsSize"), formatBytes(record.audioBytes));
      this.row(rows, this.t("view.detailsSource"), record.sourceProvider || "");
      this.row(rows, this.t("view.detailsSource"), [record.storagePath || record.legacyPrivatePath].filter(Boolean).join(" · "));
      this.row(rows, this.t("catalog.narrator"), record.narrator);
      this.row(rows, this.t("catalog.audioFormats"), record.audioFormats.join(", "));
      this.row(rows, this.t("catalog.audioFiles"), String(record.audioFileCount));
      this.row(rows, this.t("catalog.modified"), record.audioLastModified);
      this.row(rows, this.t("catalog.categories"), record.category.join(", "));
      this.row(rows, this.t("catalog.metadataStatus"), record.metadataStatus);
      this.row(rows, this.t("catalog.matchStatus"), record.matchStatus);
      this.row(rows, this.t("catalog.synopsisSource"), normalizeDisplayText(record.synopsisSource));
    } else {
      const record = this.media as BookRecord;
      this.row(rows, this.t("view.detailsFormat"), record.format.toUpperCase());
      this.row(rows, this.t("view.detailsYear"), record.year);
      this.row(rows, this.t("view.detailsLanguage"), record.language);
      this.row(rows, this.t("view.detailsPublisher"), record.publisher);
      this.row(rows, this.t("view.detailsPages"), record.pages);
      this.row(rows, this.t("view.detailsSize"), formatBytes(record.size));
      if (record.tags.length) {
        const tagRow = rows.createDiv({ cls: "book-library-modal-row" });
        tagRow.createSpan({ text: this.t("view.detailsTags"), cls: "book-library-modal-label" });
        const tags = tagRow.createDiv({ cls: "book-library-modal-tags" });
        record.tags.forEach((tag) => tags.createSpan({ text: `#${tag}`, cls: "book-library-modal-tag" }));
      }
      this.row(rows, this.t("view.detailsFilePath"), record.file);
      this.row(rows, this.t("view.detailsSource"), record.source);
      this.row(rows, this.t("catalog.isbn"), record.isbn);
      this.row(rows, this.t("catalog.wikiPath"), record.wikiPath || record.markdownPath);
    }
  }

  private renderRatingAndCategories(parent: HTMLElement, audiobook: boolean): void {
    const audioRecord = audiobook ? this.media as AudiobookRecord : null;
    const record = audioRecord ? this.matchedBookFor(audioRecord) : this.media as BookRecord;
    const ratings = record ? detailRatingPresentations(record) : [];
    const categories = audioRecord
      ? audioRecord.category.filter((category) => category && category !== "Audiobooks")
      : (record?.categories || []).filter(Boolean);
    if (ratings.length === 0 && categories.length === 0) return;

    const strip = parent.createDiv({ cls: "book-library-modal-rating" });
    for (const rating of ratings) {
      const item = strip.createSpan({ cls: "book-library-modal-rating-item" });
      const stars = item.createSpan({ text: rating.unavailable ? "☆☆☆☆☆" : ratingStars(rating.value || 0), cls: "book-library-modal-stars", attr: { "aria-hidden": "true" } });
      stars.setAttribute("aria-hidden", "true");
      const source = humanizeSource(rating.source);
      if (rating.unavailable) {
        const compactSource = source.replace(/\s+search\s+\(unverified\)$/i, "");
        const link = item.createEl("a", { text: `${compactSource} · ${this.t("view.detailsRatingUnavailable")}`, href: rating.url });
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
        link.setAttribute("aria-label", `${source}: ${this.t("view.detailsRatingUnavailable")}; ${rating.status}`);
      } else {
        const text = `${rating.value?.toFixed(1)} · ${rating.count} · ${source} · ${humanizeSource(rating.status)}`;
        const value = rating.url
          ? item.createEl("a", { text, href: rating.url })
          : item.createSpan({ text });
        if (rating.url) {
          value.setAttribute("target", "_blank");
          value.setAttribute("rel", "noopener noreferrer");
        }
        value.setAttribute("aria-label", `${source}: ${this.t("view.detailsRatingAria", { rating: rating.value?.toFixed(1) || "0.0", count: rating.count })}; ${rating.status}`);
      }
    }
    if (categories.length) {
      const chips = strip.createDiv({ cls: "book-library-modal-categories" });
      categories.slice(0, 4).forEach((category) => chips.createSpan({ text: category, cls: "book-library-modal-category" }));
    }
  }

  private renderDescription(parent: HTMLElement, record: BookRecord, compareText = record.summary): void {
    const sourced = record.sourceDescriptions?.find((entry) => entry.kind === "source" && entry.text)
      || record.sourceDescriptions?.find((entry) => entry.text);
    const description = normalizeDisplayText(sourced?.text || record.description || "");
    if (!description || description === normalizeDisplayText(compareText)) return;
    const box = parent.createDiv({ cls: "book-library-modal-description" });
    box.createEl("h3", { text: sourced?.kind === "ai-summary" ? this.t("catalog.aiSummary") : this.t("catalog.description") });
    box.createDiv({ text: description, cls: "book-library-modal-description-text" });
    if (sourced) {
      const source = box.createDiv({ cls: "book-library-modal-description-source" });
      source.setText(`${humanizeSource(sourced.source)}${sourced.checkedAt ? ` · ${sourced.checkedAt.slice(0, 10)}` : ""}`);
    }
  }

  private renderAtAGlance(parent: HTMLElement, audiobook: boolean): void {
    const record = this.media;
    const values: string[] = [];
    if (audiobook) {
      const audio = record as AudiobookRecord;
      values.push(audio.mediaType.toUpperCase());
      if (audio.year) values.push(audio.year);
      if (audio.language) values.push(audio.language);
    } else {
      const book = record as BookRecord;
      values.push(book.format.toUpperCase());
      if (book.year) values.push(book.year);
      if (book.language) values.push(book.language);
      if (book.pages) values.push(`${book.pages} ${this.t("view.detailsPages").toLowerCase()}`);
    }
    if (values.length === 0) return;
    const box = parent.createDiv({ cls: "book-library-modal-glance" });
    box.createEl("h3", { text: this.t("view.atAGlance") });
    const chips = box.createDiv({ cls: "book-library-modal-glance-chips" });
    values.forEach((value) => chips.createSpan({ text: value, cls: "book-library-modal-glance-chip" }));
  }

  private renderWhyRead(parent: HTMLElement, audiobook: boolean, productMode: boolean): void {
    if (!productMode) return;
    const audioRecord = audiobook ? this.media as AudiobookRecord : null;
    const record = audioRecord ? this.matchedBookFor(audioRecord) : this.media as BookRecord;
    const themes = (record?.themes || []).filter(Boolean);
    const categories = record
      ? (record.categories || []).filter(Boolean)
      : (audioRecord?.category || []).filter((category) => category && category !== "Audiobooks");
    const reasons = themes.length ? themes : categories;
    const reasonSource = reasons.length
      ? record?.sourceDescriptions?.find((entry) => entry.text)?.source
        || record?.enrichmentSource
        || record?.source
        || audioRecord?.sourceProvider
        || "local"
      : audiobook
        ? audioRecord?.synopsisSource || audioRecord?.sourceProvider || "local"
        : record?.sourceDescriptions?.find((entry) => entry.text)?.source
          || record?.enrichmentSource
          || record?.source
          || "local";
    const box = parent.createDiv({ cls: "book-library-modal-why" });
    box.createEl("h3", { text: this.t(audiobook ? "view.whyListen" : "view.whyRead") });
    box.createDiv({
      text: reasons.length
        ? reasons.slice(0, 3).join(" · ")
        : audiobook
          ? (audioRecord?.synopsis
            ? this.t("view.whyListenFromSynopsis")
            : this.t("view.whyListenUnavailable"))
          : (record?.description || record?.summary
            ? this.t("view.whyReadFromDescription")
            : this.t("view.whyReadUnavailable")),
      cls: "book-library-modal-why-text",
    });
    const fullSource = humanizeSource(reasonSource);
    const shortSource = conciseDetailSource(reasonSource);
    const source = box.createDiv({
      text: `${this.t("view.detailsSource")}: ${shortSource}`,
      cls: "book-library-modal-why-source",
    });
    if (shortSource !== fullSource) source.setAttribute("title", fullSource);
  }

  private renderReviews(parent: HTMLElement, audiobook: boolean, productMode: boolean): void {
    if (!shouldRenderPublicReviews(productMode ? "product" : "minimal", this.deps.reviewsEnabled, audiobook)) return;
    const record = this.media as BookRecord;
    const reviews = (record.reviews || []).slice(0, 3);
    if (reviews.length === 0) return;
    const box = parent.createDiv({ cls: "book-library-modal-reviews" });
    box.createEl("h3", { text: this.t("view.detailsReviews") });
    for (const review of reviews) {
      const card = box.createDiv({ cls: "book-library-review" });
      const head = card.createDiv({ cls: "book-library-review-head" });
      head.createSpan({ text: review.author || this.t("view.unknownAuthor"), cls: "book-library-review-author" });
      if (review.rating) {
        head.createSpan({ text: "★ " + review.rating.toFixed(1), cls: "book-library-review-stars" });
      }
      if (review.source) {
        head.createSpan({ text: humanizeSource(review.source), cls: "book-library-modal-review-source" });
      }
      card.createDiv({ text: review.text, cls: "book-library-review-text" });
    }
  }

  private renderRelated(parent: HTMLElement): void {
    if (this.isAudiobook(this.media)) {
      const audioRecord = this.media as AudiobookRecord;
      const matchedBooks = (audioRecord.relatedBooks || [])
        .map((hash) => this.deps.getBookByHash?.(hash))
        .filter((record): record is BookRecord => Boolean(record));
      const topicLinks = [...new Set(audioRecord.relatedTopicLinks || [])];
      if (matchedBooks.length > 0) {
        const books = this.relatedSection(parent, this.t("view.detailsRelated"));
        for (const related of matchedBooks.slice(0, 8)) {
          this.renderRelatedBookItem(books, related);
        }
      }
      if (topicLinks.length > 0) {
        const topics = this.relatedSection(parent, this.t("catalog.relatedTopics"));
        for (const link of topicLinks.slice(0, 8)) {
          const interactive = typeof this.deps.openTopicLink === "function";
          const label = this.audiobookTopicLabel(audioRecord, link);
          if (interactive) {
            const openTopic = topics.createEl("button", { text: label, cls: "book-library-related-topic" });
            openTopic.setAttribute("aria-label", `${label}: ${this.t("view.detailsOpenNote")}`);
            openTopic.addEventListener("click", () => this.deps.openTopicLink?.(link));
          } else {
            topics.createSpan({ text: label, cls: "book-library-related-topic is-static" });
          }
        }
      }
      if (matchedBooks.length === 0 && topicLinks.length === 0) {
        const list = this.relatedSection(parent, this.t("view.detailsRelated"));
        list.createDiv({ text: this.t("view.detailsNoRelated"), cls: "book-library-muted" });
      }
      return;
    }
    const list = this.relatedSection(parent, this.t("view.detailsRelated"));
    if (this.media.related.length === 0) {
      list.createDiv({ text: this.t("view.detailsNoRelated"), cls: "book-library-muted" });
      return;
    }
    let rendered = 0;
    for (const hash of this.media.related) {
      const related = this.deps.getBookByHash?.(hash);
      if (!related) continue;
      rendered += 1;
      this.renderRelatedBookItem(list, related);
    }
    if (rendered === 0) {
      list.createDiv({ text: this.t("view.detailsNoRelated"), cls: "book-library-muted" });
    }
  }

  private relatedSection(parent: HTMLElement, title: string): HTMLElement {
    const box = parent.createDiv({ cls: "book-library-modal-related" });
    box.createEl("h3", { text: title });
    return box.createDiv({ cls: "book-library-related-list" });
  }

  private renderRelatedBookItem(list: HTMLElement, related: BookRecord): void {
    const item = list.createEl("article", { cls: "book-library-related-item" });
    item.setAttribute("role", "group");
    const thumbWrap = item.createDiv({ cls: "book-library-related-thumb" });
    const relatedCover = related.cover ? this.deps.getCoverUrl(related.cover) : "";
    if (relatedCover) {
      const img = thumbWrap.createEl("img", { cls: "book-library-related-cover", attr: { alt: related.title } });
      img.addEventListener("error", () => thumbWrap.empty(), { once: true });
      img.src = relatedCover;
    } else {
      thumbWrap.createDiv({ text: initials(related.title), cls: "book-library-related-placeholder" });
    }
    const textWrap = item.createDiv({ cls: "book-library-related-text" });
    textWrap.createSpan({ text: related.title, cls: "book-library-related-title" });
    textWrap.createSpan({ text: related.author || this.t("view.unknownAuthor"), cls: "book-library-related-author" });
    const actions = textWrap.createDiv({ cls: "book-library-related-actions" });
    const openRelated = actions.createEl("button", { text: this.t("view.detailsOpenNote"), cls: "book-library-related-open" });
    openRelated.setAttribute("aria-label", `${normalizeDisplayText(related.title)}: ${this.t("view.detailsOpenNote")}`);
    openRelated.addEventListener("click", () => this.finish(() => this.deps.openNote(related)));
  }

  private t(key: TranslationKey, params?: Record<string, string | number>): string {
    return this.deps.t(key, params);
  }

  private finish(action: () => void): void {
    this.restoreFocusOnClose = false;
    this.close();
    action();
  }

  private isAudiobook(value: BookRecord | AudiobookRecord): value is AudiobookRecord {
    return "audioBytes" in value;
  }

  private matchedBookFor(record: AudiobookRecord): BookRecord | undefined {
    for (const hash of record.relatedBooks || []) {
      const match = this.deps.getBookByHash?.(hash);
      if (match) return match;
    }
    return undefined;
  }

  private audiobookTopicLabel(record: AudiobookRecord, link: string): string {
    const linkSlug = link.split("/").pop()?.replace(/\.md$/, "") || "";
    return record.category.find((category) => slugify(category) === linkSlug)
      || linkSlug.replace(/-/g, " ")
      || link;
  }

  private row(parent: HTMLElement, label: string, value: string): void {
    if (!value) return;
    const element = parent.createDiv({ cls: "book-library-modal-row" });
    element.createSpan({ text: label, cls: "book-library-modal-label" });
    element.createSpan({ text: value, cls: "book-library-modal-value" });
  }
}
