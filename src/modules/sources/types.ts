import type { ResultAsync } from "neverthrow";
import type { AudioFormat } from "@/db/entities";
import type { AlbumId, ArtistId, PlaylistId, TrackId } from "@/types/ids";
import type {
  SourceAlbumDTO,
  SourceArtistDTO,
  SourceError,
  SourcePage,
  SourcePlaylistDTO,
  SourceTrackDTO,
} from "@/types/source-dto";

import type { SourceKind } from "@/types/track-ref";

// Live in @/types so services and queries can use them without importing this module.
export type {
  SourceAlbumDTO,
  SourceArtistDTO,
  SourceArtistRef,
  SourceError,
  SourceErrorKind,
  SourcePage,
  SourcePlaylistDTO,
  SourceTrackDTO,
} from "@/types/source-dto";

/**
 * What a paged search asks for. "all" is the mixed shelf a source puts
 * together itself — the ranking is the source's, not ours.
 */
export type SourceSearchScope = "all" | "track" | "album" | "artist" | "playlist";

/**
 * One search result. A page of these is heterogeneous under scope "all" and
 * uniform under the others; the discriminant is what lets one list render
 * both without the caller knowing which it asked for.
 */
export type SourceSearchHit
  = | { kind: "track"; item: SourceTrackDTO }
    | { kind: "album"; item: SourceAlbumDTO }
    | { kind: "artist"; item: SourceArtistDTO }
    | { kind: "playlist"; item: SourcePlaylistDTO };

/** Collections a source can expose. */
export type SourceEntity = "artists" | "albums" | "playlists";

/**
 * What a source can do with one collection. Listing and opening are separate
 * questions: YouTube has no browsable album catalog, yet a single album opens
 * fine by id — a source that answers "no" to browsing still belongs on the
 * album page it was routed to. Conflating the two either hides working pages
 * or advertises catalogs that don't exist.
 */
export interface SourceEntityCaps {
  /** Enumerate the catalog — library pages, source dropdowns. */
  list: boolean;
  /** Open one by id — /album/<kind>:<id> and friends. */
  open: boolean;
}

export interface SourceCapabilities {
  artists: SourceEntityCaps;
  albums: SourceEntityCaps;
  playlists: SourceEntityCaps;
  search: boolean;
  /** Can hand over a file for an offline copy. */
  download: boolean;
}

/**
 * Download progress payload — the same contract the Rust `yt_download`
 * progress channel emits ({@link import("@/modules/youtube/types").YtDownloadEvent}),
 * so the download manager is source-agnostic.
 */
export type DownloadEvent
  = | { type: "progress"; data: { downloaded: number; total: number | null } }
    | { type: "processing" };

export interface SourceProvider {
  readonly id: SourceKind;
  readonly capabilities: SourceCapabilities;
  /** Platform + settings gate (IS_TAURI, ND configured, …). */
  readonly isAvailable: boolean;

  /**
   * The cheapest request that proves the configured source answers — a
   * credential check, not a catalog read. Optional: a source with nothing to
   * configure has nothing to probe, and `isAvailable` already covers whether
   * it applies at all.
   */
  checkConnection?(): ResultAsync<void, SourceError>;

  listArtists(): ResultAsync<SourceArtistDTO[], SourceError>;
  listAlbums(p: { offset: number; limit: number; sort: "alpha" | "newest" }):
  ResultAsync<SourceAlbumDTO[], SourceError>;
  getAlbum(id: AlbumId): ResultAsync<{ album: SourceAlbumDTO; tracks: SourceTrackDTO[] }, SourceError>;
  /**
   * `tracks` is the artist's top songs and `playlists` the shelves an artist
   * page may carry, where the source has such notions (YouTube's artist page,
   * Subsonic's getTopSongs). Both are omitted rather than empty when it does
   * not, so a page can tell "none" from "not offered".
   */
  getArtist(id: ArtistId): ResultAsync<{
    artist: SourceArtistDTO;
    albums: SourceAlbumDTO[];
    tracks?: SourceTrackDTO[];
    playlists?: SourcePlaylistDTO[];
  }, SourceError>;
  listPlaylists(): ResultAsync<SourcePlaylistDTO[], SourceError>;
  getPlaylist(id: PlaylistId): ResultAsync<{ playlist: SourcePlaylistDTO; tracks: SourceTrackDTO[] }, SourceError>;
  /**
   * A playlist too long to arrive whole. The first call passes a null cursor
   * and gets the metadata with it; later calls pass the previous page's
   * cursor and get `playlist: null`, since the metadata does not change.
   *
   * Optional: a source whose playlists arrive complete from
   * {@link SourceProvider.getPlaylist} simply omits it, and the presence of
   * the method is what tells a page to paginate.
   */
  getPlaylistPage?(id: PlaylistId, cursor: string | null): ResultAsync<{
    playlist: SourcePlaylistDTO | null;
    page: SourcePage<SourceTrackDTO>;
  }, SourceError>;
  search(q: string, types: ("track" | "album" | "artist")[], p: { offset: number; limit: number }):
  ResultAsync<{ tracks: SourceTrackDTO[]; albums: SourceAlbumDTO[]; artists: SourceArtistDTO[] }, SourceError>;
  /**
   * Search a page at a time, for the sources whose results arrive by
   * continuation rather than by offset — and whose result set is worth
   * scrolling rather than capping at one request.
   *
   * Optional, and independent of {@link SourceProvider.search}: a source that
   * answers a whole query in one call omits it, and the presence of the
   * method is what tells a pane it can page.
   */
  searchPage?(q: string, scope: SourceSearchScope, cursor: string | null):
  ResultAsync<SourcePage<SourceSearchHit>, SourceError>;

  /** Metadata snapshot for pin / revalidate-on-view. */
  getTrack(id: TrackId): ResultAsync<SourceTrackDTO, SourceError>;
  /** Synchronously builds the proxied cover URL for a DTO's coverRef. */
  coverUrl(coverRef: string, size?: number): string;
  resolveStreamUrl(id: TrackId): ResultAsync<string, SourceError>;
  /**
   * Warms the backend audio cache for an upcoming queue entry so the
   * `stream://` proxy answers the next track's requests from memory.
   * Optional: sources whose playback needs no warm-up simply omit it.
   */
  prefetch?(id: TrackId): ResultAsync<void, SourceError>;
  downloadToFile(id: TrackId, onProgress?: (e: DownloadEvent) => void):
  ResultAsync<{ path: string; format?: AudioFormat }, SourceError>;
  /**
   * Flags an in-flight downloadToFile as cancelled — that call then fails
   * with kind "CANCELLED". Optional: sources without cancellable
   * downloads simply omit it. // добавлен в M4: отмена активной загрузки
   */
  cancelDownload?(id: TrackId): ResultAsync<void, SourceError>;
}
