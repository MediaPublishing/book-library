import * as path from "path";

/**
 * Resolves a scanned catalog path only when it stays within the configured
 * library root. Catalog metadata must never be able to open an arbitrary path.
 */
export function resolveBookFilePath(libraryPath: string, catalogFile: string): string | null {
  const root = libraryPath.trim();
  const relativeFile = catalogFile.trim();
  if (!root || !relativeFile) return null;
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, relativeFile);
  const relative = path.relative(resolvedRoot, candidate);
  if (!relative || relative.startsWith(".." + path.sep) || relative === ".." || path.isAbsolute(relative)) return null;
  return candidate;
}

/** Returns the containing folder for a validated catalog file path. */
export function resolveBookFolderPath(libraryPath: string, catalogFile: string): string | null {
  const filePath = resolveBookFilePath(libraryPath, catalogFile);
  return filePath ? path.dirname(filePath) : null;
}

/**
 * Resolves an index-controlled path inside an explicit output root. This keeps
 * stale or manipulated catalog indexes from reading files outside the vault.
 */
export function resolveContainedPath(outputRoot: string, relativePath: string): string | null {
  const root = outputRoot.trim();
  const candidate = relativePath.trim();
  if (!root || !candidate) return null;
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (!relative || relative.startsWith(".." + path.sep) || relative === ".." || path.isAbsolute(relative)) {
    return null;
  }
  return resolvedCandidate;
}
