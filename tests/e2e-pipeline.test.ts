import { describe, expect, it } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import JSZip from "jszip";
import { LibraryIndexer } from "../src/indexer";
import { MetadataProvider } from "../src/metadata";
import { convertEpubToMarkdown } from "../src/conversion";
import { AiPipeline } from "../src/ai";
import { DEFAULT_SETTINGS } from "../src/types";

const execFileAsync = promisify(execFile);

const coverJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
  "base64"
);

async function makeEpub(title: string, author: string, withCover: boolean) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
  );
  const coverItem = withCover
    ? '<item id="cover" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>'
    : "";
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:identifier id="uid">x</dc:identifier><dc:title>${title}</dc:title><dc:creator>${author}</dc:creator><dc:language>de</dc:language></metadata><manifest>${coverItem}<item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>`
  );
  zip.file(
    "OEBPS/c.xhtml",
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Inhalt</title></head><body><h1>Kapitel Eins</h1><p>Wichtiger Inhalt.</p></body></html>'
  );
  if (withCover) zip.file("OEBPS/cover.jpg", coverJpeg);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

async function hasPandoc() {
  try {
    await execFileAsync("pandoc", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

describe("end-to-end pipeline", () => {
  it("scan -> covers -> related -> convert -> wiki -> incremental cache", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bl-e2e-"));
    const library = path.join(root, "Buecher");
    const catalog = path.join(root, "vault", "_catalog");
    const covers = path.join(root, "vault", "_catalog", "covers");
    const markdownOut = path.join(root, "vault", "_books");
    const wikiOut = path.join(root, "vault", "_wiki");
    fs.mkdirSync(path.join(library, "Geschichte"), { recursive: true });
    fs.mkdirSync(covers, { recursive: true });
    fs.writeFileSync(path.join(library, "Geschichte", "Buch A.epub"), await makeEpub("Buch A", "Autorin A", true));
    fs.writeFileSync(path.join(library, "Geschichte", "Buch B.epub"), await makeEpub("Buch B", "Autorin A", false));

    const provider = new MetadataProvider(async () => ({ status: 404, text: "" }));
    const indexer = new LibraryIndexer(provider);
    const first = await indexer.scan({
      libraryPath: library,
      catalogDir: catalog,
      coversDir: covers,
      wikiDir: "_wiki",
      includeExtensions: ["epub", "pdf"],
      tagsFromFolders: true,
      fetchMetadata: false,
      maxFiles: 100,
      language: "de",
    });
    expect(first.added).toBe(2);
    const records = Object.values(first.index.entries);
    expect(records.every((r) => r.tags.includes("geschichte"))).toBe(true);
    const withCover = records.find((r) => r.cover);
    expect(withCover).toBeTruthy();
    expect(fs.existsSync(path.join(covers, withCover!.cover))).toBe(true);
    const withoutCover = records.find((r) => !r.cover)!;
    expect(withoutCover.related).toContain(withCover!.hash);

    if (await hasPandoc()) {
      const input = path.join(library, withoutCover.file);
      const result = await convertEpubToMarkdown(input, markdownOut);
      expect(fs.existsSync(result.outputPath)).toBe(true);
      const script = path.join(root, "echo-model.sh");
      fs.writeFileSync(script, "#!/bin/sh\nprintf '%s\\n' \"## Kernaussage\n$1\"\n", { mode: 0o755 });
      const settings = {
        ...DEFAULT_SETTINGS,
        aiProvider: "local" as const,
        localModelCommand: `bash ${script} {prompt}`,
        maxTokensPerBook: 4000,
        budgetCents: 100,
      };
      const wiki = await new AiPipeline(settings, wikiOut, { spentCents: 0, limitCents: 100 }, "de").generateWiki(
        withoutCover,
        result.outputPath
      );
      expect(wiki.pages.length).toBeGreaterThan(1);
    }

    const second = await indexer.scan({
      libraryPath: library,
      catalogDir: catalog,
      coversDir: covers,
      wikiDir: "_wiki",
      includeExtensions: ["epub", "pdf"],
      tagsFromFolders: true,
      fetchMetadata: false,
      maxFiles: 100,
      language: "de",
    });
    expect(second.added + second.updated).toBe(0);
  }, 60000);
});
