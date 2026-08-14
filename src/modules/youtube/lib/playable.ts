import { isEphemeralTrack, type PlayerTrack, type Track } from "@/modules/player/types";
import { ytVideoIdFromStreamUrl } from "@/lib/stream-url";
import { unproxiedThumbnail } from "./thumbnail";
import type { YtMusicTrack, YtPlayable, YtSearchResult } from "../types";

/**
 * Rebuilds a {@link YtPlayable} from an ephemeral `stream://…/yt/…` queue
 * track (the video id is the stream URL's last path segment) so menu actions
 * like download can work on already-playing YouTube tracks. Returns null for
 * non-YT tracks.
 */
export function ytPlayableFromEphemeral(track: PlayerTrack | null): YtPlayable | null {
  if (!isEphemeralTrack(track) || track.source.type !== "url") return null;

  const id = ytVideoIdFromStreamUrl(track.source.url);
  if (!id) return null;

  const coverUrl = unproxiedThumbnail(track.cover);
  return {
    id,
    title: track.title,
    artist: track.artist ?? null,
    thumbnail: coverUrl,
    duration: track.duration ?? null,
    meta: {
      title: track.title,
      artists: track.artist ? track.artist.split(/,\s*/).filter(Boolean) : [],
      album: track.albumName ?? null,
      coverUrl,
    },
  };
}

export function playableFromVideo(video: YtSearchResult): YtPlayable {
  return {
    id: video.id,
    title: video.title,
    artist: video.uploader,
    thumbnail: video.thumbnail,
    duration: video.duration,
  };
}

/**
 * Display-only `Track` shape so YT tracks can render through the shared
 * {@link TrackExpanded} row. Only the fields the row reads are filled; it must
 * never reach library flows (likes, menus, queue-by-id) — those are disabled
 * via the row's `actions` slot.
 */
export function ytDisplayTrack(track: YtMusicTrack): Track {
  return {
    kind: "library",
    id: track.id,
    title: track.title,
    artist: track.artists.map(a => a.name).join(", "),
    artistIds: [],
    albumName: track.album?.name ?? "",
    duration: track.duration ?? 0,
    isLiked: false,
  } as unknown as Track;
}

/**
 * `fallbackThumbnail` covers album/playlist track listings where YT omits
 * per-track covers — without it the player/queue show no artwork at all.
 * `fallbackArtist` covers search rows whose artist name list came back
 * empty (the author resolved lazily via `yt_track_author`) — it feeds the
 * display string AND the meta written into downloaded tags.
 */
export function playableFromMusicTrack(
  track: YtMusicTrack,
  fallbackThumbnail?: string | null,
  fallbackArtist?: string | null,
): YtPlayable {
  const parsedNames = track.artists.map(a => a.name);
  const artistNames = parsedNames.length === 0 && fallbackArtist ? [fallbackArtist] : parsedNames;
  const thumbnail = track.thumbnail ?? fallbackThumbnail ?? null;
  return {
    id: track.id,
    title: track.title,
    artist: artistNames.join(", ") || null,
    thumbnail,
    duration: track.duration,
    meta: {
      title: track.title,
      artists: artistNames,
      album: track.album?.name ?? null,
      coverUrl: thumbnail,
    },
  };
}
