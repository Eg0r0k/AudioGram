import type { AlbumId, ArtistId, PlaylistId, TagId, TrackId } from "@/types/ids";
import type { TrackSortKey } from "@/modules/tracks/types";
import type { SourceKind } from "@/types/track-ref";

export const queryKeys = {
  library: {
    summary: () => ["library", "summary"] as const,
  },
  artists: {
    all: () => ["artists"] as const,
    detail: (id: ArtistId) => ["artists", id] as const,
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
    detail: (ownerType: "album" | "playlist" | "artist", ownerId: string) =>
      ["covers", ownerType, ownerId] as const,
  },
  recommendations: {
    forTrack: (trackId: TrackId, cacheVersion: number, limit: number) =>
      ["recommendations", "forTrack", trackId, cacheVersion, limit] as const,
    analysisProgress: () => ["recommendations", "analysisProgress"] as const,
  },
  source: {
    artists: (kind: SourceKind | null) => ["source", kind, "artists"] as const,
    albumsInf: (kind: SourceKind | null, sort: string) => ["source", kind, "albums", sort] as const,
    album: (kind: SourceKind | null, id: AlbumId) => ["source", kind, "album", id] as const,
    artist: (kind: SourceKind | null, id: ArtistId) => ["source", kind, "artist", id] as const,
    playlists: (kind: SourceKind | null) => ["source", kind, "playlists"] as const,
    playlist: (kind: SourceKind | null, id: string) => ["source", kind, "playlist", id] as const,
    search: (kind: SourceKind | null, q: string) => ["source", kind, "search", q] as const,
  },
  youtube: {
    searchAll: (query: string) => ["youtube", "search", "all", query] as const,
    searchList: (chip: string, query: string) => ["youtube", "search", chip, query] as const,
    playlist: (id: string) => ["youtube", "playlist", id] as const,
    album: (id: string) => ["youtube", "album", id] as const,
    artist: (id: string) => ["youtube", "artist", id] as const,
  },
  stats: {
    all: () => ["stats"] as const,
    topTracks: (limit: number, since?: number) =>
      ["stats", "topTracks", limit, since] as const,
    topTracksMeta: (ids: readonly string[]) =>
      ["stats", "topTracksMeta", ...ids] as const,
    topArtists: (limit: number, since?: number) =>
      ["stats", "topArtists", limit, since] as const,
    topArtistsMeta: (ids: readonly string[]) =>
      ["stats", "topArtistsMeta", ...ids] as const,
    topGenres: (limit: number, since?: number) => ["stats", "topGenres", limit, since] as const,
    sonicProfile: (since?: number) => ["stats", "sonicProfile", since] as const,
    totalTime: (since?: number) => ["stats", "totalTime", since] as const,
    dailyActivity: (days: number) => ["stats", "dailyActivity", days] as const,
    recentHistory: (limit: number) => ["stats", "recentHistory", limit] as const,
  },
} as const;
