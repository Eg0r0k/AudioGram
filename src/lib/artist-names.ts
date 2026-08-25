// Artist (and album) naming rules shared by every place that turns text into
// entities: the file-import worker, the track editor, the artist/album pickers,
// the remote pin cascade and the query layer. Dependency-free on purpose —
// the metadata worker imports it and cannot pull Dexie in.

// Identity is whitespace-, case- AND unicode-form-insensitive: tags routinely
// carry stray padding, inconsistent casing ("СЕРЕГА ПИРАТ" vs "Серега Пират"),
// doubled/non-breaking spaces and NFD-decomposed accents (macOS), and a key
// that differs on any of these would split one artist/album into several.
// NFKC additionally folds the full-width/half-width forms common in Japanese
// tags. The per-letter folds below cover casings toLowerCase() can't round-
// trip: uppercase tags erase İ/ı, ß→SS and ё→Е distinctions, so both sides
// fold to one representative. Genuine accents (é, è…) stay significant.
// Display keeps the first-seen (or already stored) spelling.
export const identityKey = (name: string): string =>
  name
    .normalize("NFKC")
    .toLowerCase()
    // İ lowercases to "i" + combining dot above; fold to plain i.
    .replace(/i̇/g, "i")
    // Turkish dotless ı: caps tags lowercase I to i, losing the distinction.
    .replace(/ı/g, "i")
    // Greek final sigma ς == medial σ.
    .replace(/ς/g, "σ")
    // ß uppercases to SS, so caps tags come back as "ss".
    .replace(/ß/g, "ss")
    // Russian tags use ё and е interchangeably.
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();

/** The stored spelling: inner whitespace collapsed, padding removed. */
export const normalizeName = (name: string): string => name.replace(/\s+/g, " ").trim();

/**
 * Normalizes each name and drops blanks and duplicates (by identity, first
 * spelling wins), keeping order.
 */
export const dedupeArtistNames = (names: readonly string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = normalizeName(raw);
    const key = identityKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
};

/**
 * Splits a joined artist string into names. `,` and `;` are the usual tag
 * separators; `&` counts too because YT Music files a collab channel as ONE
 * entity named "A & B", and the library wants A and B. `/` and `|` are not
 * separators — they occur inside names (AC/DC).
 */
export const splitArtistNames = (value: string | undefined): string[] =>
  value ? dedupeArtistNames(value.split(/[,;&]/)) : [];
