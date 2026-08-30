import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { Channel, invoke } from "@tauri-apps/api/core";
import { ndCoverUrl, ndSongStreamUrl } from "@/lib/stream-url";
import { parseTrackRef } from "@/types/track-ref";
import type { AlbumId, ArtistId, PlaylistId, TrackId } from "@/types/ids";
import { subsonicFetch, type NdConfig } from "../navidrome/api/subsonic";
import type {
  GetAlbumList2Payload,
  GetAlbumPayload,
  GetArtistPayload,
  GetArtistsPayload,
  GetPlaylistPayload,
  GetPlaylistsPayload,
  GetSongPayload,
  Search3Payload,
} from "../navidrome/api/types";
import { mapNdAlbum, mapNdArtist, mapNdPlaylist, mapNdSong } from "../navidrome/mappers";
import { getNdConfig } from "../navidrome/config";
import type { DownloadEvent, SourceError, SourceProvider } from "../types";

const unavailable = <T>(): ResultAsync<T, SourceError> =>
  errAsync<T, SourceError>({ kind: "UNAVAILABLE", message: "Navidrome source is not configured" });

const withConfig = <T>(call: (config: NdConfig) => ResultAsync<T, SourceError>): ResultAsync<T, SourceError> => {
  const config = getNdConfig();
  return config ? call(config) : unavailable<T>();
};

const ndIdOf = (id: TrackId | AlbumId | ArtistId | PlaylistId): string | null => {
  const ref = parseTrackRef(id as TrackId);
  return ref.kind === "nd" ? ref.songId : null;
};

/** getAlbumList2 caps size at 500 per the Subsonic contract. */
const MAX_ALBUM_PAGE = 500;

/**
 * `invoke("nd_download")` rejects with plain strings built on the Rust side
 * (never carrying upstream URLs). A manager-initiated cancel rejects with
 * the literal string "cancelled" (nd.rs) — mapped onto kind "CANCELLED"
 * here, at the only boundary that still sees the raw string.
 */
function mapNdDownloadError(raw: unknown): SourceError {
  const message = raw instanceof Error ? raw.message : String(raw);
  if (message === "cancelled") return { kind: "CANCELLED", message };
  if (/status 40[13]\b/.test(message)) return { kind: "AUTH", message };
  if (message.includes("not configured")) return { kind: "UNAVAILABLE", message };
  if (message.startsWith("request failed") || message.startsWith("download failed")) {
    return { kind: "NETWORK", message };
  }
  return { kind: "UNKNOWN", message };
}

export const ndSourceProvider: SourceProvider = {
  id: "nd",

  capabilities: {
    artists: { list: true, open: true },
    albums: { list: true, open: true },
    playlists: { list: true, open: true },
    search: true,
    download: true,
  },

  get isAvailable() {
    return getNdConfig() !== null;
  },

  listArtists() {
    return withConfig(config =>
      subsonicFetch<GetArtistsPayload>(config, "getArtists").map(payload =>
        (payload.artists?.index ?? []).flatMap(group => group.artist ?? []).map(mapNdArtist),
      ),
    );
  },

  listAlbums(p) {
    return withConfig(config =>
      subsonicFetch<GetAlbumList2Payload>(config, "getAlbumList2", {
        type: p.sort === "newest" ? "newest" : "alphabeticalByName",
        size: Math.min(p.limit, MAX_ALBUM_PAGE),
        offset: p.offset,
      }).map(payload => (payload.albumList2?.album ?? []).map(mapNdAlbum)),
    );
  },

  getAlbum(id) {
    const albumId = ndIdOf(id);
    if (!albumId) return errAsync({ kind: "PARSE", message: `Not a Navidrome album id: ${id}` });
    return withConfig(config =>
      subsonicFetch<GetAlbumPayload>(config, "getAlbum", { id: albumId }).andThen((payload) => {
        if (!payload.album) return errAsync<never, SourceError>({ kind: "PARSE", message: "getAlbum returned no album" });
        return okAsync({
          album: mapNdAlbum(payload.album),
          tracks: (payload.album.song ?? []).map(mapNdSong),
        });
      }),
    );
  },

  getArtist(id) {
    const artistId = ndIdOf(id);
    if (!artistId) return errAsync({ kind: "PARSE", message: `Not a Navidrome artist id: ${id}` });
    return withConfig(config =>
      subsonicFetch<GetArtistPayload>(config, "getArtist", { id: artistId }).andThen((payload) => {
        if (!payload.artist) return errAsync<never, SourceError>({ kind: "PARSE", message: "getArtist returned no artist" });
        return okAsync({
          artist: mapNdArtist(payload.artist),
          albums: (payload.artist.album ?? []).map(mapNdAlbum),
        });
      }),
    );
  },

  listPlaylists() {
    return withConfig(config =>
      subsonicFetch<GetPlaylistsPayload>(config, "getPlaylists").map(payload =>
        (payload.playlists?.playlist ?? []).map(mapNdPlaylist),
      ),
    );
  },

  getPlaylist(id) {
    const playlistId = ndIdOf(id);
    if (!playlistId) return errAsync({ kind: "PARSE", message: `Not a Navidrome playlist id: ${id}` });
    return withConfig(config =>
      subsonicFetch<GetPlaylistPayload>(config, "getPlaylist", { id: playlistId }).andThen((payload) => {
        if (!payload.playlist) return errAsync<never, SourceError>({ kind: "PARSE", message: "getPlaylist returned no playlist" });
        return okAsync({
          playlist: mapNdPlaylist(payload.playlist),
          tracks: (payload.playlist.entry ?? []).map(mapNdSong),
        });
      }),
    );
  },

  search(q, types, p) {
    return withConfig(config =>
      subsonicFetch<Search3Payload>(config, "search3", {
        query: q,
        songCount: types.includes("track") ? p.limit : 0,
        songOffset: p.offset,
        albumCount: types.includes("album") ? p.limit : 0,
        albumOffset: p.offset,
        artistCount: types.includes("artist") ? p.limit : 0,
        artistOffset: p.offset,
      }).map(payload => ({
        tracks: (payload.searchResult3?.song ?? []).map(mapNdSong),
        albums: (payload.searchResult3?.album ?? []).map(mapNdAlbum),
        artists: (payload.searchResult3?.artist ?? []).map(mapNdArtist),
      })),
    );
  },

  getTrack(id) {
    const songId = ndIdOf(id);
    if (!songId) return errAsync({ kind: "PARSE", message: `Not a Navidrome track id: ${id}` });
    return withConfig(config =>
      subsonicFetch<GetSongPayload>(config, "getSong", { id: songId }).andThen((payload) => {
        if (!payload.song) return errAsync<never, SourceError>({ kind: "PARSE", message: "getSong returned no song" });
        return okAsync(mapNdSong(payload.song));
      }),
    );
  },

  coverUrl(coverRef, size) {
    return ndCoverUrl(coverRef, size);
  },

  resolveStreamUrl(id) {
    const songId = ndIdOf(id);
    if (!songId) return errAsync({ kind: "PARSE", message: `Not a Navidrome track id: ${id}` });
    if (!this.isAvailable) return unavailable<string>();
    return okAsync(ndSongStreamUrl(songId));
  },

  prefetch(id) {
    const songId = ndIdOf(id);
    if (!songId) return errAsync({ kind: "PARSE", message: `Not a Navidrome track id: ${id}` });
    if (!this.isAvailable) return unavailable<void>();
    return ResultAsync.fromPromise(
      invoke<void>("nd_prefetch", { songId }),
      mapNdDownloadError,
    );
  },

  /**
   * Downloads the original file into the Rust temp dir and returns its
   * absolute path — the download manager moves it into offline storage.
   * `getSong` supplies the suffix for the file extension (normalized
   * lowercase on the Rust side; Content-Type is the fallback there).
   */
  downloadToFile(id, onProgress) {
    const songId = ndIdOf(id);
    if (!songId) return errAsync({ kind: "PARSE", message: `Not a Navidrome track id: ${id}` });
    return withConfig(config =>
      subsonicFetch<GetSongPayload>(config, "getSong", { id: songId })
        .andThen((payload) => {
          const channel = new Channel<DownloadEvent>();
          if (onProgress) channel.onmessage = onProgress;
          return ResultAsync.fromPromise(
            invoke<{ path: string; ext: string }>("nd_download", {
              songId,
              suffix: payload.song?.suffix ?? null,
              onProgress: channel,
            }),
            mapNdDownloadError,
          );
        })
        .map(result => ({ path: result.path, format: { codec: result.ext } })),
    );
  },

  cancelDownload(id) {
    const songId = ndIdOf(id);
    if (!songId) return errAsync({ kind: "PARSE", message: `Not a Navidrome track id: ${id}` });
    return ResultAsync.fromPromise(
      invoke<void>("nd_download_cancel", { songId }),
      mapNdDownloadError,
    );
  },
};
