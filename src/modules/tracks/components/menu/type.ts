import { ArtistId, PlaylistId } from "@/types/ids";
import type { EphemeralTrack, PlayerTrack, Track } from "@/modules/player/types";
import type { SourceTrackDTO } from "@/modules/sources";

// "yt" serves the YT collection/artist pages, "yt-search" the search overlay —
// separate targets because both can be mounted at the same time.
export type TrackContext = "default" | "current-track" | "queue" | "playlist" | "album" | "search" | "history" | "liked" | "artist" | "yt" | "yt-search";

//
// What the menu is open FOR. Menus serve not only library tracks but also
// not-yet-pinned DTOs from live source pages (ND browsing, YT search) and
// ephemeral tracks (open-with, current YT stream).
//
export type TrackMenuSubject
  = | { kind: "library"; track: Track }
    | { kind: "remote"; dto: SourceTrackDTO }
    | { kind: "ephemeral"; track: EphemeralTrack };

/** Adapter for the existing PlayerTrack call sites — they stay unchanged. */
export function toTrackMenuSubject(track: PlayerTrack): TrackMenuSubject {
  return track.kind === "library"
    ? { kind: "library", track }
    : { kind: "ephemeral", track };
}

/** Subjects wrap their payload — unlike tracks/DTOs they carry no own id. */
export function isTrackMenuSubject(value: PlayerTrack | TrackMenuSubject): value is TrackMenuSubject {
  return !("id" in value);
}

export function trackMenuSubjectId(subject: TrackMenuSubject | null): string | null {
  if (!subject) return null;
  return subject.kind === "remote" ? subject.dto.id : subject.track.id;
}

export interface ContextActions {
  play: () => void;
  playNext: () => void;
  addToQueue: () => void;
  showDetails: () => void;
  showLyrics: () => void;
  toggleLike: () => void;
  attachLyrics: () => void;
  addToPlaylist: (playlistId: PlaylistId) => void;
  removeFromQueue?: () => void;
  removeFromPlaylist?: () => void;
  removeFromHistory?: () => void;
  goToArtist: (artistId: ArtistId) => void;
  goToAlbum: () => void;
  /** "Save as…" — exports the local file or the offline copy to user disk. */
  exportFile: () => void;
  /** Pins a remote subject with pinned = 1 (or upgrades a shadow row). */
  addToLibrary: () => void;
  /** Degrades a remote row to shadow: playlists/like/offline copy cascade. */
  removeFromLibrary: () => void;
  /** Opens the track's page at its source (yt/nd) via plugin-opener. */
  openExternal: () => void;
}
