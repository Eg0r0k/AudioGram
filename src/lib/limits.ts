// Length ceilings for user-entered text, in one place so a dialog, an inline
// editor and the query layer can never disagree about them.

import { normalizeName } from "./artist-names";

/** Every user-named thing: track title, artist, album, playlist, sidebar folder. */
export const NAME_MAX_LENGTH = 120;
export const ARTIST_BIO_MAX_LENGTH = 500;
export const ALBUM_DESCRIPTION_MAX_LENGTH = 200;
export const PLAYLIST_DESCRIPTION_MAX_LENGTH = 300;

export type NameError = "required" | "tooLong";

/** `null` when the normalized name is acceptable. Length counts after trimming. */
export const validateName = (raw: string): NameError | null => {
  const name = normalizeName(raw);
  if (!name) return "required";
  if (name.length > NAME_MAX_LENGTH) return "tooLong";
  return null;
};

/**
 * The persistence-layer guard: returns the normalized name or throws. Forms
 * validate first and show messages; this backs them up so no caller can
 * store an empty or oversized name.
 */
export const assertValidName = (raw: string, what: string): string => {
  const error = validateName(raw);
  if (error) throw new Error(`${what}: invalid name (${error})`);
  return normalizeName(raw);
};
