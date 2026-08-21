import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { ytStreamUrl } from "@/lib/stream-url";
import { youtubeProvider } from "@/modules/youtube/provider";
import { getYoutubeMusicDetails } from "@/modules/youtube/api/youtubeApi";
import { ytMusicTrackToDto } from "@/modules/youtube/lib/playable";
import { proxiedThumbnail, THUMB_SIZE_FULL } from "@/modules/youtube/lib/thumbnail";
import { parseTrackRef } from "@/types/track-ref";
import type { YoutubeError, YtMusicEntity } from "@/modules/youtube/types";
import type { TrackId } from "@/types/ids";
import type { SourceError, SourceProvider, SourceTrackDTO } from "../types";

function mapError(error: YoutubeError): SourceError {
  switch (error.kind) {
    case "UNAVAILABLE":
    case "UNAVAILABLE_REGION":
      return { kind: "UNAVAILABLE", message: error.message };
    case "NETWORK":
      return { kind: "NETWORK", message: error.message };
    case "NOT_FOUND":
      return { kind: "NOT_FOUND", message: error.message };
    case "CANCELLED":
      // The generic contract (sources/types.ts) marks a cancelled
      // downloadToFile with kind "CANCELLED" — the download manager
      // matches on it to drop the job instead of retrying it.
      return { kind: "CANCELLED", message: error.message };
    default:
      return { kind: "UNKNOWN", message: error.message };
  }
}

const unsupported = <T>(what: string): ResultAsync<T, SourceError> =>
  errAsync<T, SourceError>({
    kind: "UNAVAILABLE",
    message: `YouTube source does not support ${what}`,
  });

const videoIdOf = (id: TrackId): string | null => {
  const ref = parseTrackRef(id);
  return ref.kind === "yt" ? ref.videoId : null;
};

// The full DTO builder (album/artist IDS included): a search-row download
// pins shadow album/artist rows, and the album row is where the cover blob
// lives — a DTO with only albumTitle pins a coverless track.
const mapMusicTrack = (entity: YtMusicEntity & { kind: "track" }): SourceTrackDTO =>
  ytMusicTrackToDto(entity);

/**
 * Adapter exposing the existing {@link youtubeProvider} through the generic
 * source contract. Scope matches what the YT backend actually offers today:
 * track search, stream resolution and file download. Album/artist/playlist
 * browsing stays on the dedicated YT pages until M5 introduces the yt album
 * and artist id spaces.
 */
export const ytSourceProvider: SourceProvider = {
  id: "yt",

  capabilities: {
    browseArtists: false,
    browseAlbums: false,
    browsePlaylists: false,
    search: true,
    download: true,
  },

  get isAvailable() {
    return youtubeProvider.isAvailable;
  },

  listArtists: () => unsupported("artist browsing"),
  listAlbums: () => unsupported("album browsing"),
  getAlbum: () => unsupported("album browsing"),
  getArtist: () => unsupported("artist browsing"),
  listPlaylists: () => unsupported("playlist browsing"),
  getPlaylist: () => unsupported("playlist browsing"),

  search(q, types, p) {
    if (p.offset > 0 || !types.includes("track")) {
      return okAsync({ tracks: [], albums: [], artists: [] });
    }

    return youtubeProvider
      .searchMusic(q, "tracks")
      .mapErr(mapError)
      .map(page => ({
        tracks: page.items
          .filter((e): e is YtMusicEntity & { kind: "track" } => e.kind === "track")
          .slice(0, p.limit)
          .map(mapMusicTrack),
        albums: [],
        artists: [],
      }));
  },

  getTrack(id) {
    const videoId = videoIdOf(id);
    if (!videoId) return errAsync({ kind: "PARSE", message: `Not a YouTube track id: ${id}` });
    return getYoutubeMusicDetails(videoId)
      .mapErr(mapError)
      .map(track => ytMusicTrackToDto(track));
  },

  coverUrl(coverRef, size = THUMB_SIZE_FULL) {
    return proxiedThumbnail(coverRef, size);
  },

  resolveStreamUrl(id) {
    const videoId = videoIdOf(id);
    if (!videoId) return errAsync({ kind: "PARSE", message: `Not a YouTube track id: ${id}` });
    return youtubeProvider
      .resolve(videoId)
      .mapErr(mapError)
      .map(resolvedId => ytStreamUrl(resolvedId));
  },

  prefetch(id) {
    const videoId = videoIdOf(id);
    if (!videoId) return errAsync({ kind: "PARSE", message: `Not a YouTube track id: ${id}` });
    return youtubeProvider.prefetch(videoId).mapErr(mapError);
  },

  downloadToFile(id, onProgress) {
    const videoId = videoIdOf(id);
    if (!videoId) return errAsync({ kind: "PARSE", message: `Not a YouTube track id: ${id}` });
    return youtubeProvider
      .download(videoId, onProgress)
      .mapErr(mapError)
      .map(result => ({ path: result.path }));
  },

  cancelDownload(id) {
    const videoId = videoIdOf(id);
    if (!videoId) return errAsync({ kind: "PARSE", message: `Not a YouTube track id: ${id}` });
    return youtubeProvider.cancelDownload(videoId).mapErr(mapError);
  },
};
