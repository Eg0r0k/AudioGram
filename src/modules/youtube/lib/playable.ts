import { isEphemeralTrack, type PlayerTrack, type Track } from "@/modules/player/types";
import { ytVideoIdFromStreamUrl } from "@/lib/stream-url";
import type { SourceTrackDTO } from "@/modules/sources/types";
import { ytAlbumId, ytArtistId, ytTrackId } from "@/types/track-ref";
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

/**
 * Full DTO from a music-track entity (collection/artist pages): carries the
 * album and artist ids so the pin cascade creates shadow album/artist rows.
 * `fallback` fills what an album listing omits per track — the page's own
 * album id/title and cover.
 */
export function ytMusicTrackToDto(
  track: YtMusicTrack,
  fallback?: { albumId?: string | null; albumTitle?: string | null; thumbnail?: string | null },
): SourceTrackDTO {
  const albumBrowseId = track.album?.id ?? fallback?.albumId ?? undefined;
  const artistIds = track.artists
    .map(artist => artist.id)
    .filter((id): id is string => !!id)
    .map(ytArtistId);
  return {
    id: ytTrackId(track.id),
    title: track.title,
    artistName: track.artists.map(a => a.name).join(", ") || undefined,
    artistIds: artistIds.length > 0 ? artistIds : undefined,
    albumId: albumBrowseId ? ytAlbumId(albumBrowseId) : undefined,
    albumTitle: track.album?.name ?? fallback?.albumTitle ?? undefined,
    duration: track.duration ?? undefined,
    trackNo: track.trackNr ?? undefined,
    coverRef: track.thumbnail ?? fallback?.thumbnail ?? undefined,
  };
}

/**
 * Bridges a YT playable into the generic source DTO — the shape the pin
 * cascade and the download manager consume (M5: shared offline mechanism).
 * Playables carry no album/artist ids, so no shadow album is created; use
 * {@link ytMusicTrackToDto} where the full entity is available.
 */
export function ytPlayableToDto(item: YtPlayable): SourceTrackDTO {
  return {
    id: ytTrackId(item.id),
    title: item.title,
    artistName: item.artist ?? undefined,
    albumTitle: item.meta?.album ?? undefined,
    duration: item.duration ?? undefined,
    coverRef: item.thumbnail ?? undefined,
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
 */
export function playableFromMusicTrack(
  track: YtMusicTrack,
  fallbackThumbnail?: string | null,
): YtPlayable {
  const artistNames = track.artists.map(a => a.name);
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
