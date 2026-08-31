import * as fs from "fs";
import * as path from "path";
import type { BookRecord } from "./types";
import { assignCatalogFileNames, catalogFileName } from "./catalog";
import { isBookLibraryOwnedMarkdown } from "./generated-note";

export interface CatalogPathReplacement {
  hash: string;
  from: string;
  to: string;
}

/**
 * Vergibt neue lesbare Namen ohne die alte Dateinamensgeschichte zu erben.
 * Dadurch werden Encoding-Fehler auch dann entfernt, wenn sie nur im alten
 * Katalogpfad gespeichert waren.
 */
export function refreshCatalogPaths(
  records: BookRecord[]
): { replacements: CatalogPathReplacement[]; changed: number; catalogPaths: Record<string, string> } {
  const withoutLegacyPaths = records.map(({ catalogPath: _catalogPath, ...record }) => record);
  const assigned = assignCatalogFileNames(withoutLegacyPaths, (record) => record.hash);
  const replacements: CatalogPathReplacement[] = [];
  let changed = 0;

  for (const record of records) {
    const next = assigned[record.hash];
    if (!next) continue;
    if (record.catalogPath !== next) changed += 1;
    replacements.push({ hash: record.hash, from: record.catalogPath || "", to: next });
    record.catalogPath = next;
  }

  return { replacements, changed, catalogPaths: assigned };
}

/** Versetzt ersetzte Notizen in einen versteckten Backup-Ordner. */
export function archiveReplacedCatalogNotes(
  catalogDir: string,
  replacements: CatalogPathReplacement[]
): number {
  const backupDir = path.join(catalogDir, ".book-library-superseded-notes");
  let archived = 0;

  for (const replacement of replacements) {
    if (!replacement.from || replacement.from === replacement.to) continue;
    const source = path.join(catalogDir, path.basename(replacement.from));
    if (!fs.existsSync(source)) continue;
    try {
      if (!isBookLibraryOwnedMarkdown(fs.readFileSync(source, "utf8"), "book")) continue;
    } catch {
      continue;
    }
    fs.mkdirSync(backupDir, { recursive: true });
    const destination = uniqueBackupPath(path.join(backupDir, `${replacement.hash}--${path.basename(replacement.from)}`));
    fs.renameSync(source, destination);
    archived += 1;
  }
  return archived;
}

function uniqueBackupPath(preferred: string): string {
  if (!fs.existsSync(preferred)) return preferred;
  const directory = path.dirname(preferred);
  const extension = path.extname(preferred);
  const stem = path.basename(preferred, extension);
  let attempt = 2;
  while (true) {
    const candidate = path.join(directory, `${stem} (${attempt})${extension}`);
    if (!fs.existsSync(candidate)) return candidate;
    attempt += 1;
  }
}
