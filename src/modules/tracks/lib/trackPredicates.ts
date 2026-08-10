import type { Track } from "@/modules/player/types";

export function canDownloadTrack(track: Track | Track[]): boolean {
  if (Array.isArray(track)) return track.some(item => canDownloadTrack(item));
  return track.storagePath.length > 0;
}

export function trackHasLyrics(track: Track): boolean {
  return !!track.lyricsPath;
}
