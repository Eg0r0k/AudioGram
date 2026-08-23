import { INITIAL_METADATA_READ } from "./constants";

/**
 * Formats whose tags, covers and duration are fully recoverable from the file
 * head: flac (STREAMINFO carries total samples), m4a (faststart moov), mp3
 * (given a Xing/Info/VBRI frame — verified separately). Everything else (ogg,
 * opus, wav, …) derives duration from the data size or the last page, so a
 * truncated head would silently corrupt it.
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
