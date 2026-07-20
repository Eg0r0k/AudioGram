/**
 * Normalizes a relative storage key for consistent handling across adapters:
 * converts backslashes to forward slashes, collapses duplicate slashes, and
 * strips trailing slashes so a folder-like path (e.g. `"tracks/"`) can never
 * masquerade as a filename. A lone `"/"` is preserved.
 *
 * Intended for relative storage keys only — do NOT feed absolute OS paths
 * (Windows UNC `\\server\share` would be corrupted by slash collapsing).
 */
export function normalizePath(path: string): string {
  const unified = path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (unified === "/") return unified;
  return unified.endsWith("/") ? unified.slice(0, -1) : unified;
}
