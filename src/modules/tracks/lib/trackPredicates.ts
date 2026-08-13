import { isEphemeralTrack, type PlayerTrack, type Track } from "@/modules/player/types";
import { parseTrackRef, type SourceKind } from "@/types/track-ref";

/** Source of a library track, derived from its (possibly prefixed) id. */
export function trackSourceKind(track: Track): SourceKind {
  return parseTrackRef(track.id).kind;
}

export function isRemoteTrack(track: Track): boolean {
  return trackSourceKind(track) !== "local";
}

/** True when the track's own file is on disk (remote rows keep this empty). */
export function trackHasLocalFile(track: Track): boolean {
  return track.storagePath.length > 0;
}

export function canDownloadTrack(track: Track | Track[]): boolean {
  if (Array.isArray(track)) return track.some(item => canDownloadTrack(item));
  return trackHasLocalFile(track);
}

export function trackHasLyrics(track: Track): boolean {
  return !!track.lyricsPath;
}

/**
 * Absolute file path of an "Open with" ephemeral track (desktop), null for
 * everything else — the gate for the "Import to library" CTA.
 */
export function ephemeralFilePath(track: PlayerTrack | null): string | null {
  if (!isEphemeralTrack(track) || track.source.type !== "path") return null;
  return track.source.path;
}
