import { normalizeDisplayText } from "./util";

export interface PdfMetadata {
  title: string;
  author: string;
  pages: string;
  isbn: string;
}

export function parsePdfMetadata(buffer: Buffer): PdfMetadata {
  const text = buffer.subarray(0, 64 * 1024).toString("latin1");
  const info = text.match(/\/Info\s*(\d+)\s+(\d+)\s+R/);
  let title = "";
  let author = "";
  if (info) {
    const start = text.indexOf(`/${info[1]} ${info[2]} R`);
    if (start >= 0) {
      const slice = text.slice(start, start + 8000);
      title = cleanPdfText(slice.match(/\/Title\s*\(([^)]*)\)/)?.[1] || slice.match(/\/Title\s*<([0-9A-Fa-f]+)>/)?.[1]);
      author = cleanPdfText(slice.match(/\/Author\s*\(([^)]*)\)/)?.[1] || slice.match(/\/Author\s*<([0-9A-Fa-f]+)>/)?.[1]);
    }
  }
  if (!title) {
    title = cleanPdfText(text.match(/<dc:title>\s*<rdf:Alt>\s*<rdf:li[^>]*>([^<]*)<\/rdf:li>/i)?.[1]);
    author = cleanPdfText(text.match(/<dc:creator>\s*<rdf:Seq>\s*<rdf:li[^>]*>([^<]*)<\/rdf:li>/i)?.[1]);
  }
  const pages = text.match(/\/Count\s+(\d+)/)?.[1] || "";
  const isbn = text.match(/(?:ISBN[-: ]*)?((?:\d[ -]?){9}[\dXx])/i)?.[1]?.replace(/[ -]/g, "") || "";
  return { title, author, pages, isbn };
}

function cleanPdfText(value?: string): string {
  if (!value) return "";
  return normalizeDisplayText(value.replace(/\\\(/g, "(").replace(/\\\)/g, ")"));
}
