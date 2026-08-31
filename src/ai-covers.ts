import { requestUrl } from "obsidian";
import type { BookRecord } from "./types";
import type { Language } from "./i18n";
import { genreOf } from "./util";

export interface AiCoverSettings {
  openAiApiKey: string;
  model: string;
  size: string;
  batchSize: number;
}

export interface AiCoverSheetResult {
  buffer: Buffer;
  costCents: number;
}

export const AI_COVER_GRID = { cols: 4, rows: 4, batchSize: 16 } as const;

export interface AiCoverBatchManifest {
  version: 1;
  batchId: string;
  status: "planned" | "generated" | "sliced" | "assigned" | "failed";
  grid: typeof AI_COVER_GRID;
  createdAt: string;
  language: Language;
  prompt: string;
  items: Array<{
    slot: number;
    hash: string;
    title: string;
    author: string;
    genre: string;
    metadataSource: string;
  }>;
}

export function hasUsableCoverIdentity(book: BookRecord): boolean {
  const title = book.title.trim();
  const author = book.author.trim();
  return Boolean(title && author && author !== "-" && !/^unknown$/i.test(author));
}

export function createCoverBatchManifest(
  batchId: string,
  books: BookRecord[],
  language: Language = "en",
  createdAt = new Date().toISOString()
): AiCoverBatchManifest {
  if (books.length !== AI_COVER_GRID.batchSize) {
    throw new Error(`AI-Cover-Batch braucht exakt ${AI_COVER_GRID.batchSize} Bücher.`);
  }
  const invalid = books.find((book) => !hasUsableCoverIdentity(book));
  if (invalid) {
    throw new Error(`Unvollständige Cover-Metadaten für ${invalid.hash}.`);
  }
  const prompt = buildCoverSheetPrompt(books, language);
  return {
    version: 1,
    batchId,
    status: "planned",
    grid: AI_COVER_GRID,
    createdAt,
    language,
    prompt,
    items: books.map((book, index) => ({
      slot: index + 1,
      hash: book.hash,
      title: book.title.trim(),
      author: book.author.trim(),
      genre: genreOf(book),
      metadataSource: book.source || "local",
    })),
  };
}

export function buildCoverSheetPrompt(
  books: BookRecord[],
  language: Language = "en"
): string {
  if (books.length !== AI_COVER_GRID.batchSize) {
    throw new Error(`AI-Cover-Prompt braucht exakt ${AI_COVER_GRID.batchSize} Bücher.`);
  }
  const tiles = books
    .map(
      (book, index) =>
        `Tile ${index + 1}: title "${book.title}", author "${book.author}"` +
        `${genreOf(book) !== "unknown" ? `, genre "${genreOf(book)}"` : ""}`
    )
    .join("\n");
  const instruction =
    language === "de"
      ? "Erstelle ein einziges, exakt ausgerichtetes 4×4-Raster mit sechzehn eigenständigen hochkanten Buchcovern im 2:3-Format. Lesereihenfolge: links nach rechts, oben nach unten. Jede Kachel muss den Titel und den Autor wortgetreu und gut lesbar zeigen. Jedes Design ist originär, sichtbar anders und passend zu Titel und Genre. Dünne neutrale Stege sind erlaubt, damit das Raster sauber geschnitten werden kann. Keine Logos, Wasserzeichen, Nummern, Zitate oder zusätzlichen Texte."
      : "Create one exactly aligned 4x4 grid with sixteen distinct 2:3 portrait book covers. Reading order is left to right, top to bottom. Every tile must show the title and author verbatim and legibly. Each design is original, visibly distinct, and appropriate to the title and genre. Thin neutral gutters are allowed for clean slicing. No logos, watermarks, numbers, quotes, or extra text.";
  return [
    instruction,
    "4x4 grid. Exactly 16 covers. Do not omit, merge, duplicate, or reorder tiles.",
    tiles,
  ].join("\n\n");
}

export function coverTileRect(
  index: number,
  cols: number,
  rows: number,
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } {
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: Math.floor((col * width) / cols),
    y: Math.floor((row * height) / rows),
    w: Math.floor(width / cols),
    h: Math.floor(height / rows),
  };
}

export async function generateCoverSheet(
  settings: AiCoverSettings,
  prompt: string
): Promise<AiCoverSheetResult> {
  if (!settings.openAiApiKey) {
    throw new Error("OpenAI-API-Key fehlt.");
  }
  const res = await requestUrl({
    url: "https://api.openai.com/v1/images/generations",
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model || "gpt-image-1",
      prompt,
      n: 1,
      size: settings.size || "1024x1024",
      response_format: "b64_json",
    }),
    throw: false,
  });
  if (res.status !== 200) {
    throw new Error(`OpenAI-Bildfehler ${res.status}: ${res.text.slice(0, 300)}`);
  }
  const data = JSON.parse(res.text);
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI hat kein Bild geliefert.");
  }
  return {
    buffer: Buffer.from(b64, "base64"),
    costCents: estimateAiCoverCostCents(settings.batchSize || 4),
  };
}

export function estimateAiCoverCostCents(count: number): number {
  // Konservativer Schätzwert für gpt-image-1 ohne Abhängigkeit von Auflösung/Qualität.
  return count * 4;
}

export async function sliceCoverSheet(
  buffer: Buffer,
  cols: number,
  rows: number
): Promise<Buffer[]> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    throw new Error("Canvas-Slicing ist nur im Obsidian-Client verfügbar.");
  }
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)]));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Cover-Sheet konnte nicht geladen werden."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas-Kontext nicht verfügbar.");
    const results: Buffer[] = [];
    for (let i = 0; i < cols * rows; i++) {
      const rect = coverTileRect(i, cols, rows, img.width, img.height);
      canvas.width = rect.w;
      canvas.height = rect.h;
      context.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("toBlob fehlgeschlagen."))), "image/jpeg", 0.9);
      });
      results.push(Buffer.from(await blob.arrayBuffer()));
    }
    return results;
  } finally {
    URL.revokeObjectURL(url);
  }
}
