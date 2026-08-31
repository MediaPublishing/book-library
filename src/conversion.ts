import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface ConversionResult {
  outputPath: string;
  tool: string;
  chars: number;
}

export async function findConversionTool(): Promise<string | null> {
  for (const tool of ["pandoc", "ebook-convert", "epub2md"]) {
    try {
      await execFileAsync(tool, ["--version"]);
      return tool;
    } catch {
      // nächste Option prüfen
    }
  }
  return null;
}

export async function convertEpubToMarkdown(
  inputPath: string,
  outputDir: string
): Promise<ConversionResult> {
  const tool = await findConversionTool();
  if (!tool) {
    throw new Error("Kein Konvertierungstool gefunden. Installiere Pandoc oder Calibre.");
  }
  fs.mkdirSync(outputDir, { recursive: true });
  const base = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${sanitize(base)}.md`);

  if (tool === "pandoc") {
    await execFileAsync("pandoc", [inputPath, "-t", "markdown_strict", "-o", outputPath, "--wrap=none"]);
  } else if (tool === "ebook-convert") {
    await execFileAsync("ebook-convert", [inputPath, outputPath]);
  } else if (tool === "epub2md") {
    const folder = path.join(outputDir, sanitize(base));
    await execFileAsync("epub2md", [inputPath, folder]);
    return { outputPath: path.join(folder, "README.md"), tool, chars: countChars(path.join(folder, "README.md")) };
  }
  return { outputPath, tool, chars: countChars(outputPath) };
}

function countChars(file: string): number {
  try {
    return fs.readFileSync(file, "utf8").length;
  } catch {
    return 0;
  }
}

function sanitize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
