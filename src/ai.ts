import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { requestUrl } from "obsidian";
import { chunkText, estimateTokens, genreOf, wikiChapterPath, wikiMainPath } from "./util";
import type { BookRecord, LibrarySettings } from "./types";
import { catalogFileName, catalogLinkTarget } from "./catalog";
import { translate, type Language } from "./i18n";

export interface WikiResult {
  pages: Array<{ file: string; content: string }>;
  tokens: number;
  costCents: number;
  provider: string;
}

export interface BudgetState {
  spentCents: number;
  limitCents: number;
}

const PROMPT_VERSION = 1;

interface WikiSection {
  title: string;
  text: string;
}

function chapterContent(title: string, content: string): string {
  return title ? `# ${title}\n\n${content.trim()}` : content.trim();
}

/**
 * Metadata-only books get a local, source-bound wiki instead of being skipped.
 * This deliberately does not ask an AI to invent chapter content or concepts.
 */
export function hasMetadataWikiSource(record: BookRecord, reviewsEnabled = true): boolean {
  return Boolean(
    record.description ||
    record.summary ||
    (record.categories || []).length ||
    (record.themes || []).length ||
    (reviewsEnabled && (record.reviews || []).length) ||
    record.rating ||
    record.ratingsCount
  );
}

export function buildMetadataWiki(
  record: BookRecord,
  wikiDir: string,
  language: Language = "en",
  reviewsEnabled = true
): WikiResult {
  if (!hasMetadataWikiSource(record, reviewsEnabled)) {
    throw new Error("Keine Metadaten für ein Fallback-Wiki vorhanden.");
  }
  const german = language === "de";
  const description = record.description || record.summary;
  const categories = (record.categories || []).filter(Boolean);
  const themes = (record.themes || []).filter(Boolean);
  const reviews = reviewsEnabled
    ? (record.reviews || []).filter((review) => review.text).slice(0, 3)
    : [];
  const lines = [`# ${record.title}`, ""];

  lines.push(`## ${german ? "Über das Buch" : "About this book"}`, "");
  lines.push(description || (german ? "Keine Beschreibung vorhanden." : "No description available."), "");

  lines.push(`## ${german ? "Kernideen" : "Key ideas"}`, "");
  if (themes.length) {
    lines.push(...themes.map((theme) => `- ${theme}`));
  } else if (categories.length) {
    lines.push(...categories.map((category) => `- ${category}`));
  } else {
    lines.push(german ? "- Keine belegten Kernideen vorhanden." : "- No source-backed key ideas available.");
  }
  lines.push("");

  lines.push(`## ${german ? "Verwandte Themen" : "Related topics"}`, "");
  if (categories.length) {
    lines.push(...categories.map((category) => `- ${category}`));
  } else {
    lines.push(german ? "- Keine Kategorien vorhanden." : "- No categories available.");
  }
  lines.push("");

  if (reviews.length) {
    lines.push(`## ${german ? "Lokale Rezensionen" : "Local reviews"}`, "");
    for (const review of reviews) {
      const label = [review.author, review.rating ? `★ ${review.rating.toFixed(1)}` : ""].filter(Boolean).join(" · ");
      lines.push(`- ${label ? `${label}: ` : ""}${review.text}`);
    }
    lines.push("");
  }

  lines.push(`## ${german ? "Quellen" : "Sources"}`, "");
  lines.push(`- ${record.enrichmentSource || record.source || (german ? "Lokaler Katalog" : "Local catalog")}`);
  if (record.rating || record.ratingsCount) {
    lines.push(`- ${german ? "Aggregierte Bewertung" : "Aggregate rating"}: ${record.rating || 0}${record.ratingsCount ? ` (${record.ratingsCount})` : ""}`);
  }

  return {
    pages: [{ file: wikiMainPath(record, wikiDir), content: lines.join("\n").trim() + "\n" }],
    tokens: 0,
    costCents: 0,
    provider: "metadata",
  };
}

/** Splits a converted book at recognised Markdown chapters before paragraph chunking. */
export function splitWikiSections(text: string, maxTokens: number): WikiSection[] {
  const chapterStart = /^#{1,3}\s+(.+)$/gm;
  const matches = [...text.matchAll(chapterStart)];
  const rawSections = matches.length
    ? [
      {
        title: "Introduction",
        text: text.slice(0, matches[0].index).trim(),
      },
      ...matches.map((match, index) => ({
        title: match[1].trim(),
        text: text.slice((match.index || 0) + match[0].length, matches[index + 1]?.index).trim(),
      })),
    ].filter((section) => section.text.length > 0)
    : [{ title: "", text }];
  const sections: WikiSection[] = [];
  const safeMaxTokens = Math.max(500, Math.floor(maxTokens));
  for (const raw of rawSections) {
    const pieces = chunkText(raw.text, safeMaxTokens);
    pieces.forEach((piece, index) => {
      const baseTitle = raw.title || `Section ${sections.length + 1}`;
      sections.push({
        title: pieces.length > 1 ? `${baseTitle} (${index + 1})` : baseTitle,
        text: piece,
      });
    });
  }
  return sections.filter((section) => section.text.length > 0);
}

export class AiPipeline {
  private settings: LibrarySettings;
  private language: Language;
  private cache: Record<string, string> = {};
  private cachePath: string;
  private budget: BudgetState;

  constructor(settings: LibrarySettings, cacheDir: string, budget: BudgetState, language: Language = "en") {
    this.settings = settings;
    this.language = language;
    this.cachePath = path.join(cacheDir, ".wiki-cache.json");
    this.budget = budget;
    this.loadCache();
  }

  async generateWiki(
    record: BookRecord,
    markdownPath: string
  ): Promise<WikiResult> {
    if (this.settings.aiProvider === "none") {
      throw new Error("Kein AI-Provider konfiguriert.");
    }
    const text = fs.existsSync(markdownPath) ? fs.readFileSync(markdownPath, "utf8") : "";
    if (!text) {
      throw new Error("Kein Markdown-Text vorhanden. EPUB→Markdown zuerst ausführen.");
    }
    const chunks = splitWikiSections(text, Math.max(500, Math.floor(this.settings.maxTokensPerBook / 2)));
    const pages: Array<{ file: string; content: string }> = [];
    let tokens = 0;
    let costCents = 0;
    const provider = this.settings.aiProvider;
    const model = this.settings.aiModel || provider;

    for (const chunk of chunks) {
      const cacheKey = `${record.hash}|${provider}|${model}|v${PROMPT_VERSION}|${chunk.title}|${chunk.text.slice(0, 64)}`;
      const cached = this.cache[cacheKey];
      if (cached) {
        tokens += estimateTokens(chunk.text);
        pages.push({ file: this.pageFile(record, pages.length), content: chapterContent(chunk.title, cached) });
        continue;
      }
      if (this.budget.spentCents >= this.budget.limitCents) {
        throw new Error("Budget erreicht. Nächster Lauf setzt das Queue-Limit.");
      }
      const result = await this.callProvider(chunk.text, record);
      tokens += result.tokens;
      costCents += result.costCents;
      this.budget.spentCents += result.costCents;
      this.cache[cacheKey] = result.text;
      this.saveCache();
      pages.push({ file: this.pageFile(record, pages.length), content: chapterContent(chunk.title, result.text) });
    }

    const summary = pages.map((p) => p.content).join("\n\n").slice(0, 4000);
    const contents = chunks
      .map((chunk, index) => `- [[${this.pageFile(record, index)}|${chunk.title || `Section ${index + 1}`}]]`)
      .join("\n");
    return {
      pages: [
        ...pages,
        {
          file: wikiMainPath(record, this.settings.wikiDir || "_wiki"),
          content: `# ${record.title}\n\n## Contents\n\n${contents}\n\n## Key ideas\n\n${summary}\n`,
        },
      ],
      tokens,
      costCents,
      provider,
    };
  }

  private pageFile(record: BookRecord, index: number): string {
    return wikiChapterPath(record, this.settings.wikiDir || "_wiki", index);
  }

  private async callProvider(
    chunk: string,
    record: BookRecord
  ): Promise<{ text: string; tokens: number; costCents: number }> {
    const prompt = buildWikiPrompt(record, chunk, this.language);
    const tokens = estimateTokens(chunk) + estimateTokens(prompt) / 2;
    switch (this.settings.aiProvider) {
      case "openrouter": {
        if (!this.settings.openRouterApiKey) throw new Error("OpenRouter-Key fehlt.");
        const res = await requestUrl({
          url: this.settings.openRouterBaseUrl || "https://openrouter.ai/api/v1/chat/completions",
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.settings.openRouterApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.settings.aiModel || "openai/gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
          }),
          throw: false,
        });
        if (res.status !== 200) {
          throw new Error(`OpenRouter-Fehler ${res.status}: ${res.text.slice(0, 300)}`);
        }
        const data = JSON.parse(res.text);
        const text = data.choices?.[0]?.message?.content || "";
        const costCents = estimateCostCents(data.usage?.total_tokens || tokens, "openrouter");
        return { text, tokens: data.usage?.total_tokens || tokens, costCents };
      }
      case "codex":
        return this.runCli(this.settings.codexCommand || "codex", ["exec", "--skip-git-repo-check", "--json", prompt], tokens);
      case "opencode":
        return this.runCli(this.settings.opencodeCommand || "opencode", ["run", prompt], tokens);
      case "claude":
        return this.runCli(this.settings.claudeCommand || "claude", ["-p", prompt], tokens);
      case "local": {
        const command = (this.settings.localModelCommand || "").replace("{prompt}", prompt);
        if (!command) throw new Error("Kein lokaler Modell-Befehl konfiguriert.");
        const parts = command.split(" ");
        return this.runCli(parts[0], parts.slice(1), tokens);
      }
      default:
        throw new Error("Unbekannter AI-Provider.");
    }
  }

  private runCli(
    command: string,
    args: string[],
    tokens: number
  ): Promise<{ text: string; tokens: number; costCents: number }> {
    return new Promise((resolve, reject) => {
      execFile(command, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
        if (error) {
          reject(new Error(`CLI-Fehler (${command}): ${String(error.message).slice(0, 500)}`));
          return;
        }
        let text = stdout.trim();
        try {
          const data = JSON.parse(text);
          if (Array.isArray(data)) {
            text = data.map((item: any) => item.text || item.content || "").filter(Boolean).join("\n");
          } else if (data.result) {
            text = typeof data.result === "string" ? data.result : JSON.stringify(data.result);
          }
        } catch {
          // Plain Text ist ebenfalls gültig.
        }
        resolve({ text, tokens, costCents: 0 });
      });
    });
  }

  private loadCache(): void {
    try {
      this.cache = JSON.parse(fs.readFileSync(this.cachePath, "utf8"));
    } catch {
      this.cache = {};
    }
  }

  private saveCache(): void {
    fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
    fs.writeFileSync(this.cachePath, JSON.stringify(this.cache), "utf8");
  }
}

export function estimateCostCents(tokens: number, provider: string): number {
  if (provider !== "openrouter") return 0;
  // Konservative Annahme: 2,5 USD je 1M Tokens (kleines Modell, Mittelwert).
  return Math.ceil((tokens / 1_000_000) * 250);
}

export function buildWikiIndex(
  books: BookRecord[],
  wikiDir: string,
  language: Language = "en",
  catalogDir = "_catalog"
): string {
  const groups = new Map<string, BookRecord[]>();
  for (const book of books) {
    const genre = genreOf(book);
    const group = groups.get(genre) || [];
    group.push(book);
    groups.set(genre, group);
  }
  const heading = language === "de" ? "# Wiki-Index" : "# Wiki Index";
  const lines = [heading, ""];
  for (const genre of [...groups.keys()].sort((a, b) => a.localeCompare(b, language))) {
    const group = groups.get(genre) || [];
    lines.push(`## ${genre}`, "");
    for (const book of group.sort((a, b) => a.title.localeCompare(b.title, language))) {
      const link =
        book.wikiStatus === "done"
          ? `[[${book.wikiPath || wikiMainPath(book, wikiDir)}|${book.title}]]`
          : `[[${catalogLinkTarget(catalogFileName(book), catalogDir)}|${book.title}]]`;
      lines.push(`- ${link}${book.author ? ` — ${book.author}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

export function buildWikiPrompt(record: BookRecord, chunk: string, language: Language = "en"): string {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const bookLabel = language === "de" ? "Buch" : "Book";
  return [
    t("ai.createWikiNote"),
    `${bookLabel}: ${record.title}${record.author ? ` (${record.author})` : ""}`,
    "",
    t("ai.formatAnswer"),
    t("ai.coreClaim"),
    t("ai.concepts"),
    t("ai.people"),
    t("ai.quotes"),
    t("ai.crossReferences"),
    "",
    t("ai.stayFactual"),
    "",
    "=== BUCHABSCHNITT ===",
    "",
    chunk,
  ].join("\n");
}
