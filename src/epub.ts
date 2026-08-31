import * as path from "path";
import JSZip from "jszip";
import { normalizeDisplayText } from "./util";

export interface EpubMetadata {
  title: string;
  author: string;
  language: string;
  publisher: string;
  isbn: string;
  description: string;
  pages: string;
  coverPath?: string;
}

function clean(value: string | undefined): string {
  return normalizeDisplayText(value);
}

function findIsbn(text: string): string {
  const normalized = text.replace(/[ -]/g, "");
  const isbn13 = normalized.match(/\d{13}/);
  if (isbn13) return isbn13[0];
  const isbn10 = normalized.match(/\d{9}[\dXx]/);
  return isbn10 ? isbn10[0] : "";
}

export async function parseEpub(buffer: Buffer): Promise<EpubMetadata> {
  const zip = await JSZip.loadAsync(buffer);
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) {
    throw new Error("Kein META-INF/container.xml gefunden");
  }
  const containerXml = await containerFile.async("string");
  const opfMatch = containerXml.match(/full-path="([^"]+\.opf)"/i);
  if (!opfMatch) {
    throw new Error("Kein OPF-Pfad im Container gefunden");
  }
  const opfPath = opfMatch[1];
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error("OPF-Datei fehlt");
  }
  const opfXml = await opfFile.async("string");

  const title = clean(opfXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1]);
  const authorRaw = opfXml.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i)?.[1];
  const author = clean(authorRaw).replace(/^.*:/, "");
  const language = clean(opfXml.match(/<dc:language[^>]*>([\s\S]*?)<\/dc:language>/i)?.[1]);
  const publisher = clean(opfXml.match(/<dc:publisher[^>]*>([\s\S]*?)<\/dc:publisher>/i)?.[1]);
  const identifier = clean(
    opfXml.match(/<dc:identifier[^>]*>([\s\S]*?)<\/dc:identifier>/i)?.[1]
  );
  const description = clean(opfXml.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i)?.[1]);
  const isbn = findIsbn(identifier) || findIsbn(opfXml);
  const spineMatch = opfXml.match(/<spine[^>]*>([\s\S]*?)<\/spine>/i);
  const pages = spineMatch ? (spineMatch[1].match(/<itemref\b/gi) || []).length : 0;

  const manifestMatch = opfXml.match(/<manifest[^>]*>([\s\S]*?)<\/manifest>/i);
  let coverPath: string | undefined;
  if (manifestMatch) {
    const manifest = manifestMatch[1];
    const coverId = (
      manifest.match(/<item[^>]*id="([^"]*cover[^"]*)"[^>]*>/i)?.[1] ||
      manifest.match(/<item[^>]*properties="[^"]*cover-image[^"]*"[^>]*id="([^"]+)"/i)?.[1]
    );
    const item = coverId
      ? manifest.match(new RegExp(`<item[^>]*id="${escapeRegExp(coverId)}"[^>]*href="([^"]+)"`, "i"))
      : manifest.match(/<item[^>]*properties="[^"]*cover-image[^"]*"[^>]*href="([^"]+)"/i);
    if (item) {
      const href = item[1].split("#")[0];
      coverPath = path.posix.normalize(path.posix.join(path.posix.dirname(opfPath), href));
    }
  }

  return { title, author, language, publisher, isbn, description, pages: pages ? String(pages) : "", coverPath };
}

export async function extractEpubCover(buffer: Buffer, coverPath?: string): Promise<Buffer | null> {
  const zip = await JSZip.loadAsync(buffer);
  let candidate = coverPath;
  if (!candidate) {
    candidate = Object.keys(zip.files).find((name) => /cover.*\.(jpe?g|png|webp)$/i.test(name));
  }
  if (!candidate) return null;
  const file = zip.file(candidate);
  if (!file) return null;
  return Buffer.from(await file.async("arraybuffer"));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
