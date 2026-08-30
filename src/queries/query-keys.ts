import type { AlbumId, ArtistId, PlaylistId, TagId, TrackId } from "@/types/ids";
import type { CoverOwnerType } from "@/db/entities";
import type { TrackSortKey } from "@/modules/tracks/types";
import type { SourceKind } from "@/types/track-ref";

export const queryKeys = {
  library: {
    summary: () => ["library", "summary"] as const,
  },
  artists: {
    all: () => ["artists"] as const,
    detail: (id: ArtistId) => ["artists", id] as const,
    /** Row-or-null lookup; unlike `detail` it does not throw on a miss. */
    libraryRow: (id: ArtistId | null) => ["artists", id, "libraryRow"] as const,
    search: (query: string) => ["artists", "search", query] as const,
    albums: (id: ArtistId) => ["artists", id, "albums"] as const,
    tracks: (id: ArtistId) => ["artists", id, "tracks"] as const,
    page: (id: ArtistId) => ["artists", id, "page"] as const,
    tracksPage: (id: ArtistId, sortKey?: TrackSortKey | null) => sortKey
      ? ["artists", id, "tracks", "page", sortKey] as const
      : ["artists", id, "tracks", "page"] as const,
  },
  albums: {
    all: () => ["albums"] as const,
    detail: (id: AlbumId) => ["albums", id] as const,
    /** Row-or-null lookup; unlike `detail` it does not throw on a miss. */
    libraryRow: (id: AlbumId | null) => ["albums", id, "libraryRow"] as const,
    search: (query: string) => ["albums", "search", query] as const,
    tracks: (id: AlbumId) => ["albums", id, "tracks"] as const,
    cover: (id: AlbumId) => ["covers", "album", id] as const,
    page: (id: AlbumId) => ["albums", id, "page"] as const,
    tracksPage: (id: AlbumId, sortKey?: TrackSortKey | null) => sortKey
      ? ["albums", id, "tracks", "page", sortKey] as const
      : ["albums", id, "tracks", "page"] as const,
    totalDuration: (id: AlbumId) => ["albums", id, "totalDuration"] as const,
  },
  playlists: {
    all: () => ["playlists"] as const,
    detail: (id: PlaylistId) => ["playlists", id] as const,
    /** Row-or-null lookup; unlike `detail` it does not throw on a miss. */
    libraryRow: (id: PlaylistId | null) => ["playlists", id, "libraryRow"] as const,
    tracks: (id: PlaylistId) => ["playlists", id, "tracks"] as const,
    cover: (id: PlaylistId) => ["covers", "playlist", id] as const,
    page: (id: PlaylistId) => ["playlists", id, "page"] as const,
    tracksPage: (id: PlaylistId, sortKey?: TrackSortKey | null) => sortKey
      ? ["playlists", id, "tracks", "page", sortKey] as const
      : ["playlists", id, "tracks", "page"] as const,
    totalDuration: (id: PlaylistId) => ["playlists", id, "totalDuration"] as const,
  },
  folders: {
    all: () => ["folders"] as const,
  },
  tracks: {
    all: () => ["tracks"] as const,
    detail: (id: TrackId) => ["tracks", id] as const,
    liked: () => ["tracks", "liked"] as const,
    likedPage: () => ["tracks", "liked", "page"] as const,
    likedPageInfinite: (sortKey?: TrackSortKey | null) => sortKey
      ? ["tracks", "liked", "page", "infinite", sortKey] as const
      : ["tracks", "liked", "page", "infinite"] as const,
    likedTotalDuration: () => ["tracks", "liked", "totalDuration"] as const,
    search: (query: string) => ["tracks", "search", query] as const,
    byIds: (ids: readonly TrackId[]) => ["tracks", "byIds", ...ids] as const,
    allPaginated: (search = "") => ["tracks", "all", "paginated", search] as const,
    index: (sortKey: TrackSortKey, search = "") => ["tracks", "index", sortKey, search] as const,
    indexInfinite: (sortKey: TrackSortKey, search = "") => ["tracks", "index", "infinite", sortKey, search] as const,
    indexTotalDuration: (search = "") => ["tracks", "index", "totalDuration", search] as const,
  },
  trackChapters: {
    detail: (trackId: TrackId) => ["trackChapters", trackId] as const,
  },
  offlineCopies: {
    detail: (trackId: TrackId) => ["offlineCopies", trackId] as const,
  },
  tags: {
    all: () => ["tags"] as const,
    detail: (id: TagId) => ["tags", id] as const,
    byTrack: (trackId: TrackId) => ["tags", "track", trackId] as const,
  },
  covers: {
    all: () => ["covers"] as const,
    detail: (ownerType: CoverOwnerType, ownerId: string) =>
      ["covers", ownerType, ownerId] as const,
  },
  recommendations: {
    forTrack: (trackId: TrackId, cacheVersion: number, limit: number) =>
      ["recommendations", "forTrack", trackId, cacheVersion, limit] as const,
    analysisProgress: () => ["recommendations", "analysisProgress"] as const,
  },
  source: {
    /** Every remote catalog answer, whatever source it came from. */
    all: () => ["source"] as const,
    /** One source's slice of the above. */
    ofKind: (kind: SourceKind) => ["source", kind] as const,
    artists: (kind: SourceKind | null) => ["source", kind, "artists"] as const,
    albumsInf: (kind: SourceKind | null, sort: string) => ["source", kind, "albums", sort] as const,
    // Null ids come from skipToken-parked options.
    album: (kind: SourceKind | null, id: AlbumId | null) => ["source", kind, "album", id] as const,
    artist: (kind: SourceKind | null, id: ArtistId | null) => ["source", kind, "artist", id] as const,
    playlists: (kind: SourceKind | null) => ["source", kind, "playlists"] as const,
    playlist: (kind: SourceKind | null, id: string | null) => ["source", kind, "playlist", id] as const,
    playlistMeta: (kind: SourceKind | null, id: string | null) => ["source", kind, "playlist", id, "meta"] as const,
    playlistPages: (kind: SourceKind | null, id: string | null) => ["source", kind, "playlist", id, "pages"] as const,
    search: (kind: SourceKind | null, q: string) => ["source", kind, "search", q] as const,
    searchPages: (kind: SourceKind | null, scope: string, q: string) =>
      ["source", kind, "search", q, "pages", scope] as const,
  },
  youtube: {
    all: () => ["youtube"] as const,
    /**
     * Plain-video search — the one YouTube query with no generic counterpart.
     * Music search caches under queryKeys.source like every other source's,
     * and so do albums, artists and playlists, whatever source they came from.
     */
    videoSearch: (query: string) => ["youtube", "search", "videos", query] as const,
  },
  stats: {
    all: () => ["stats"] as const,
    /** Raw listen events of a period — the shared read behind the aggregates below. */
    events: (since?: number) => ["stats", "events", since] as const,
    topTracks: (limit: number, since?: number) =>
      ["stats", "topTracks", limit, since] as const,
    topTracksMeta: (ids: readonly string[]) =>
      ["stats", "topTracksMeta", ...ids] as const,
    topArtists: (limit: number, since?: number) =>
      ["stats", "topArtists", limit, since] as const,
    artistPlays: (artistId: string) =>
      ["stats", "artistPlays", artistId] as const,
    topGenres: (limit: number, since?: number) => ["stats", "topGenres", limit, since] as const,
    totalTime: (since?: number) => ["stats", "totalTime", since] as const,
    dailyActivity: (days: number) => ["stats", "dailyActivity", days] as const,
    recentHistory: (limit: number) => ["stats", "recentHistory", limit] as const,
    summary: (since?: number) => ["stats", "summary", since] as const,
    hourlyActivity: (since?: number) => ["stats", "hourlyActivity", since] as const,
    records: (since?: number) => ["stats", "records", since] as const,
    streaks: () => ["stats", "streaks"] as const,
  },
} as const;
