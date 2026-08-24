import { INITIAL_METADATA_READ } from "./constants";

/**
 * Formats whose tags, covers and duration are fully recoverable from the file
 * head: flac (STREAMINFO carries total samples), m4a (given a faststart moov —
 * verified separately), mp3 (given a Xing/Info/VBRI frame — likewise).
 * Everything else (ogg, opus, wav, …) derives duration from the data size or
 * the last page, so a truncated head would silently corrupt it.
 */
const HEAD_COMPLETE_FORMATS = new Set(["mp3", "flac", "m4a"]);

export const initialHeadReadSize = (ext: string, fullSize: number): number => {
  return HEAD_COMPLETE_FORMATS.has(ext) ? Math.min(INITIAL_METADATA_READ, fullSize) : fullSize;
};

const ID3_HEADER_SIZE = 10;
const VBR_SCAN_WINDOW = 4096;

const matchesAt = (bytes: Uint8Array, i: number, marker: string): boolean => {
  for (let k = 0; k < marker.length; k++) {
    if (bytes[i + k] !== marker.charCodeAt(k)) return false;
  }
  return true;
};

/**
 * Whether an mp3 head carries a Xing/Info/VBRI header. Without one the parser
 * estimates duration from the stream length, which is wrong for a truncated
 * buffer — the caller must then read the full head instead.
 *
 * Returns false (forcing the full read — the safe direction) when the ID3 tag
 * itself does not fit into the provided bytes.
 */
export const mp3HasVbrHeader = (bytes: Uint8Array): boolean => {
  let offset = 0;
  if (bytes.length >= ID3_HEADER_SIZE && matchesAt(bytes, 0, "ID3")) {
    const tagSize = ((bytes[6] & 0x7F) << 21) | ((bytes[7] & 0x7F) << 14) | ((bytes[8] & 0x7F) << 7) | (bytes[9] & 0x7F);
    offset = ID3_HEADER_SIZE + tagSize;
  }
  if (offset + 4 > bytes.length) return false;

  const end = Math.min(bytes.length, offset + VBR_SCAN_WINDOW) - 4;
  for (let i = offset; i <= end; i++) {
    if (matchesAt(bytes, i, "Xing") || matchesAt(bytes, i, "Info") || matchesAt(bytes, i, "VBRI")) {
      return true;
    }
  }
  return false;
};

const BOX_HEADER_SIZE = 8;
const BOX_LARGESIZE_HEADER_SIZE = 16;

/**
 * Whether an mp4 head carries its `moov` box — the one that holds duration and
 * tags. "Faststart" files put it before the media data, but nothing requires
 * that: ffmpeg without `-movflags +faststart` and plenty of downloads write it
 * at the very end, and parsing a head without it yields no duration at all.
 *
 * Walks the top-level box chain rather than scanning for the four letters,
 * because "moov" occurs freely inside compressed audio data.
 */
export const m4aHasMoov = (bytes: Uint8Array): boolean => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  while (offset + BOX_HEADER_SIZE <= bytes.length) {
    if (matchesAt(bytes, offset + 4, "moov")) return true;

    let size = view.getUint32(offset);
    let headerSize = BOX_HEADER_SIZE;
    // size === 1 escapes to a 64-bit largesize right after the type.
    if (size === 1) {
      if (offset + BOX_LARGESIZE_HEADER_SIZE > bytes.length) return false;
      size = view.getUint32(offset + 8) * 2 ** 32 + view.getUint32(offset + 12);
      headerSize = BOX_LARGESIZE_HEADER_SIZE;
    }
    // size === 0 means "runs to the end of the file", so nothing follows it;
    // anything shorter than its own header is malformed and cannot advance.
    if (size === 0 || size < headerSize) return false;
    offset += size;
  }
  return false;
};
