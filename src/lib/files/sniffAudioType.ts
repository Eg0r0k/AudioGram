const ascii = (head: Uint8Array, offset: number, text: string): boolean => {
  if (head.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (head[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
};

/**
 * Container sniffing for imports whose name carries no extension (Android
 * `content://` URIs). Head-of-file magic only — enough for the formats the
 * importer accepts.
 */
export const sniffAudioExtension = (head: Uint8Array): string | null => {
  if (ascii(head, 0, "ID3")) return "mp3";
  if (head.length >= 2 && head[0] === 0xFF && (head[1] & 0xE0) === 0xE0) return "mp3";
  if (ascii(head, 0, "fLaC")) return "flac";
  if (ascii(head, 0, "OggS")) return "ogg";
  if (ascii(head, 0, "RIFF") && ascii(head, 8, "WAVE")) return "wav";
  if (ascii(head, 4, "ftyp")) return "m4a";
  if (ascii(head, 0, "MAC ")) return "ape";
  return null;
};
