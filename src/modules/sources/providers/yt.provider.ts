import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { ytStreamUrl } from "@/lib/stream-url";
import { youtubeProvider } from "@/modules/youtube/provider";
import { getYoutubeMusicDetails } from "@/modules/youtube/api/youtubeApi";
import { ytMusicTrackToDto } from "@/modules/youtube/lib/playable";
import { ytErrorToSource as mapError } from "@/modules/youtube/lib/errors";
import { proxiedThumbnail } from "@/modules/youtube/lib/thumbnail";
import { THUMB_SIZE_FULL } from "@/lib/media/cover-sizes";
import { parseTrackRef, ytAlbumId, ytArtistId, ytPlaylistId } from "@/types/track-ref";
import { getLogger } from "@/lib/logger";
import type {
  YtMusicAlbum,
  YtMusicEntity,
  YtMusicPlaylist,
  YtMusicSearchKind,
} from "@/modules/youtube/types";
import type { AlbumId, ArtistId, PlaylistId, TrackId } from "@/types/ids";
import type {
  SourceAlbumDTO,
  SourceError,
  SourcePlaylistDTO,
  SourceProvider,
  SourceSearchHit,
  SourceSearchScope,
  SourceTrackDTO,
} from "../types";

const unsupported = <T>(what: string): ResultAsync<T, SourceError> =>
  errAsync<T, SourceError>({
    kind: "UNAVAILABLE",
    message: `YouTube source does not support ${what}`,
  });

/**
 * The raw YouTube id behind any yt-prefixed branded id — a video id, an
 * `MPREb_…` album browse id or a `UC…` channel id, depending on the space.
 * parseTrackRef only splits on the prefix, so one helper covers all three.
 */
const ytIdOf = (id: TrackId | AlbumId | ArtistId | PlaylistId): string | null => {
  const ref = parseTrackRef(id as TrackId);
  return ref.kind === "yt" ? ref.videoId : null;
};

/**
 * How many pages `getPlaylist` walks before giving up on completeness.
 * Callers of getPlaylist want the whole thing — queue-all, download-all —
 * so it follows continuations rather than returning a first page that looks
 * complete and is not. The cap keeps a pathological playlist from turning
 * into hundreds of round-trips; hitting it is logged, never silent.
 */
const MAX_PLAYLIST_PAGES = 20;

/**
 * The album fields every YouTube shape carries. A detail response adds a
 * track count; a shelf card does not, and the DTO's stays undefined.
 */
type YtAlbumLike = Omit<YtMusicAlbum, "albumType"> & { trackCount?: number };

const mapYtAlbum = (album: YtAlbumLike): SourceAlbumDTO => ({
  id: ytAlbumId(album.id),
  title: album.title,
  artistId: album.artists[0]?.id ? ytArtistId(album.artists[0].id) : undefined,
  artistName: album.artists.map(artist => artist.name).join(", ") || undefined,
  year: album.year ?? undefined,
  coverRef: album.thumbnail ?? undefined,
  trackCount: album.trackCount,
});

const trackDtosOf = (page: { items: YtMusicEntity[] }): SourceTrackDTO[] =>
  page.items
    .filter((item): item is YtMusicEntity & { kind: "track" } => item.kind === "track")
    .map(track => ytMusicTrackToDto(track));

/** Walks continuations until the playlist ends or the page cap is reached. */
const collectPlaylistTracks = (
  listId: string,
  tracks: SourceTrackDTO[],
  cursor: string | null,
  pageNo: number,
): ResultAsync<SourceTrackDTO[], SourceError> => {
  if (!cursor) return okAsync(tracks);
  if (pageNo >= MAX_PLAYLIST_PAGES) {
    getLogger().warn(
      `[YT] Playlist ${listId} truncated at ${tracks.length} tracks `
      + `(${MAX_PLAYLIST_PAGES}-page cap); the tail is not queued or downloaded`,
    );
    return okAsync(tracks);
  }
  return youtubeProvider
    .continueMusic(cursor, "tracks")
    .mapErr(mapError)
    .andThen(next => collectPlaylistTracks(
      listId,
      [...tracks, ...trackDtosOf(next)],
      next.continuation,
      pageNo + 1,
    ));
};

/** Shared by the playlist detail response and an artist shelf's cards. */
type YtPlaylistLike = Pick<YtMusicPlaylist, "id" | "title" | "trackCount" | "thumbnail">;

const mapYtPlaylist = (playlist: YtPlaylistLike): SourcePlaylistDTO => ({
  id: ytPlaylistId(playlist.id),
  name: playlist.title,
  // YouTube's own count is an estimate; the real end is a null continuation.
  trackCount: playlist.trackCount ?? 0,
  coverRef: playlist.thumbnail ?? undefined,
});

// The full DTO builder (album/artist IDS included): a search-row download
// pins shadow album/artist rows, and the album row is where the cover blob
// lives — a DTO with only albumTitle pins a coverless track.
const mapMusicTrack = (entity: YtMusicEntity & { kind: "track" }): SourceTrackDTO =>
  ytMusicTrackToDto(entity);

/** Generic search scope → the YT Music search tab that answers it. */
const SEARCH_KIND: Record<SourceSearchScope, YtMusicSearchKind> = {
  all: "all",
  track: "tracks",
  album: "albums",
  artist: "artists",
  playlist: "playlists",
};

/**
 * One search entity as a generic hit. An artist card carries no album count
 * and a search album card no track count — both stay undefined rather than
 * being invented as 0, which a page would print as a fact.
 */
const entityToHit = (entity: YtMusicEntity): SourceSearchHit[] => {
  switch (entity.kind) {
    case "track":
      return [{ kind: "track", item: mapMusicTrack(entity) }];
    case "album":
      return [{ kind: "album", item: mapYtAlbum(entity) }];
    case "artist":
      return [{
        kind: "artist",
        item: {
          id: ytArtistId(entity.id),
          name: entity.name,
          coverRef: entity.thumbnail ?? undefined,
        },
      }];
    case "playlist":
      return [{ kind: "playlist", item: mapYtPlaylist(entity) }];
    default:
      return [];
  }
};

/**
 * Adapter exposing the existing {@link youtubeProvider} through the generic
 * source contract. Scope matches what the YT backend actually offers today:
 * track search, stream resolution and file download. Album/artist/playlist
 * browsing stays on the dedicated YT pages until M5 introduces the yt album
 * and artist id spaces.
 */
export const ytSourceProvider: SourceProvider = {
  id: "yt",

  // open without list is the whole point of the split: an album, artist or
  // playlist opens by id, but YouTube has no catalog to enumerate, so none
  // of the three appears in the sidebar or the page-source dropdown.
  capabilities: {
    artists: { list: false, open: true },
    albums: { list: false, open: true },
    playlists: { list: false, open: true },
    search: true,
    download: true,
  },

  get isAvailable() {
    return youtubeProvider.isAvailable;
  },

  // No catalog to enumerate: YouTube has no "all albums" to walk, only
  // entities reached by id from a search or a link.
  listArtists: () => unsupported("artist browsing"),
  listAlbums: () => unsupported("album browsing"),
  listPlaylists: () => unsupported("playlist browsing"),

  getAlbum(id) {
    const browseId = ytIdOf(id);
    if (!browseId) return errAsync({ kind: "PARSE", message: `Not a YouTube album id: ${id}` });
    return youtubeProvider
      .album(browseId)
      .mapErr(mapError)
      .map(album => ({
        album: mapYtAlbum(album),
        tracks: album.tracks.map(track => ytMusicTrackToDto(track, {
          albumId: album.id,
          albumTitle: album.title,
          thumbnail: album.thumbnail,
        })),
      }));
  },

  getArtist(id) {
    const channelId = ytIdOf(id);
    if (!channelId) return errAsync({ kind: "PARSE", message: `Not a YouTube artist id: ${id}` });
    return youtubeProvider
      .artist(channelId)
      .mapErr(mapError)
      .map(artist => ({
        artist: {
          id: ytArtistId(artist.id),
          name: artist.name,
          coverRef: artist.thumbnail ?? undefined,
          albumCount: artist.albums.length,
        },
        albums: artist.albums.map(mapYtAlbum),
        tracks: artist.topTracks.map(track => ytMusicTrackToDto(track)),
        playlists: artist.playlists.map(mapYtPlaylist),
      }));
  },

  /**
   * Everything, not the first page: the callers of getPlaylist are queue-all
   * and download-all, and half a playlist there is a silent wrong answer.
   * The paged view uses getPlaylistPage instead.
   */
  getPlaylist(id) {
    const listId = ytIdOf(id);
    if (!listId) return errAsync({ kind: "PARSE", message: `Not a YouTube playlist id: ${id}` });

    return youtubeProvider
      .playlist(listId)
      .mapErr(mapError)
      .andThen(detail => collectPlaylistTracks(
        listId,
        detail.tracks.items.map(track => ytMusicTrackToDto(track)),
        detail.tracks.continuation,
        1,
      ).map(tracks => ({
        playlist: { ...mapYtPlaylist(detail), trackCount: tracks.length },
        tracks,
      })));
  },

  getPlaylistPage(id, cursor) {
    const listId = ytIdOf(id);
    if (!listId) return errAsync({ kind: "PARSE", message: `Not a YouTube playlist id: ${id}` });

    if (cursor) {
      return youtubeProvider
        .continueMusic(cursor, "tracks")
        .mapErr(mapError)
        .map(next => ({
          playlist: null,
          page: { items: trackDtosOf(next), cursor: next.continuation },
        }));
    }

    return youtubeProvider
      .playlist(listId)
      .mapErr(mapError)
      .map(detail => ({
        playlist: mapYtPlaylist(detail),
        page: {
          items: detail.tracks.items.map(track => ytMusicTrackToDto(track)),
          cursor: detail.tracks.continuation,
        },
      }));
  },

  searchPage(q, scope, cursor) {
    const kind = SEARCH_KIND[scope];

    return (cursor
      ? youtubeProvider.continueMusic(cursor, kind)
      : youtubeProvider.searchMusic(q, kind))
      .mapErr(mapError)
      .map(page => ({
        items: page.items.flatMap(entityToHit),
        cursor: page.continuation,
      }));
  },

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
    const videoId = ytIdOf(id);
    if (!videoId) return errAsync({ kind: "PARSE", message: `Not a YouTube track id: ${id}` });
    return getYoutubeMusicDetails(videoId)
      .mapErr(mapError)
      .map(track => ytMusicTrackToDto(track));
  },

  coverUrl(coverRef, size = THUMB_SIZE_FULL) {
    return proxiedThumbnail(coverRef, size);
  },

  resolveStreamUrl(id) {
    const videoId = ytIdOf(id);
    if (!videoId) return errAsync({ kind: "PARSE", message: `Not a YouTube track id: ${id}` });
    return youtubeProvider
      .resolve(videoId)
      .mapErr(mapError)
      .map(resolvedId => ytStreamUrl(resolvedId));
  },

  prefetch(id) {
    const videoId = ytIdOf(id);
    if (!videoId) return errAsync({ kind: "PARSE", message: `Not a YouTube track id: ${id}` });
    return youtubeProvider.prefetch(videoId).mapErr(mapError);
  },

  downloadToFile(id, onProgress) {
    const videoId = ytIdOf(id);
    if (!videoId) return errAsync({ kind: "PARSE", message: `Not a YouTube track id: ${id}` });
    return youtubeProvider
      .download(videoId, onProgress)
      .mapErr(mapError)
      .map(result => ({ path: result.path }));
  },

  cancelDownload(id) {
    const videoId = ytIdOf(id);
    if (!videoId) return errAsync({ kind: "PARSE", message: `Not a YouTube track id: ${id}` });
    return youtubeProvider.cancelDownload(videoId).mapErr(mapError);
  },
};
