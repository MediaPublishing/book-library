import { describe, expect, it } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import JSZip from "jszip";
import { convertEpubToMarkdown } from "../src/conversion";

const execFileAsync = promisify(execFile);

async function hasPandoc(): Promise<boolean> {
  try {
    await execFileAsync("pandoc", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

const pandocInstalled = await hasPandoc();

async function makeEpub(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:identifier id="uid">test</dc:identifier><dc:title>Konvert Test</dc:title></metadata><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>`
  );
  zip.file(
    "OEBPS/c.xhtml",
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Kapitel</title></head><body><h1>Kapitel Eins</h1><p>Wichtiger Inhalt.</p></body></html>`
  );
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("conversion", () => {
  it.skipIf(!pandocInstalled)("konvertiert EPUB zu Markdown mit Pandoc", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-conv-"));
    const input = path.join(root, "Buch.epub");
    const output = path.join(root, "out");
    fs.writeFileSync(input, await makeEpub());
    const result = await convertEpubToMarkdown(input, output);
    expect(fs.existsSync(result.outputPath)).toBe(true);
    const content = fs.readFileSync(result.outputPath, "utf8");
    expect(content).toContain("Kapitel Eins");
    expect(result.tool).toBe("pandoc");
  });
});
