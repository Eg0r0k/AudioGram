export interface YtSearchResult {
  id: string;
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
}

export interface YtArtistRef {
  id: string | null;
  name: string;
}

export interface YtAlbumRef {
  id: string;
  name: string;
}

export interface YtMusicTrack {
  /** Regular video id — plays/downloads through the existing pipeline. */
  id: string;
  title: string;
  artists: YtArtistRef[];
  /** Primary artist channel id — can be present even with empty `artists`. */
  artistId: string | null;
  album: YtAlbumRef | null;
  duration: number | null;
  thumbnail: string | null;
  isVideo: boolean;
  trackNr: number | null;
}

export interface YtMusicAlbum {
  /** `MPREb_…` browse id — for the album detail command only. */
  id: string;
  title: string;
  artists: YtArtistRef[];
  albumType: string;
  year: number | null;
  thumbnail: string | null;
}

export interface YtMusicArtist {
  /** `UC…` channel id — for the artist detail command only. */
  id: string;
  name: string;
  thumbnail: string | null;
  subscriberCount: number | null;
}

export interface YtMusicPlaylist {
  /** `PL…` / `OLAK5uy_…` / `RDCLAK…` — for the playlist detail command only. */
  id: string;
  title: string;
  owner: string | null;
  trackCount: number | null;
  thumbnail: string | null;
}

export type YtMusicEntity
  = | ({ kind: "track" } & YtMusicTrack)
    | ({ kind: "album" } & YtMusicAlbum)
    | ({ kind: "artist" } & YtMusicArtist)
    | ({ kind: "playlist" } & YtMusicPlaylist);

export interface YtPage<T> {
  items: T[];
  /** Opaque token; pass back verbatim to the matching continue command. */
  continuation: string | null;
  /** Display-only estimate — the end of the list is `continuation === null`. */
  total: number | null;
  correctedQuery: string | null;
}

export interface YtPlaylistDetail {
  id: string;
  title: string;
  owner: string | null;
  description: string | null;
  trackCount: number | null;
  thumbnail: string | null;
  fromYtm: boolean;
  tracks: YtPage<YtMusicTrack>;
}

export interface YtAlbumDetail {
  id: string;
  playlistId: string | null;
  title: string;
  artists: YtArtistRef[];
  albumType: string;
  year: number | null;
  thumbnail: string | null;
  trackCount: number;
  tracks: YtMusicTrack[];
}

export interface YtArtistDetail {
  id: string;
  name: string;
  thumbnail: string | null;
  subscriberCount: number | null;
  topTracks: YtMusicTrack[];
  albums: YtMusicAlbum[];
  playlists: YtMusicPlaylist[];
}

export type YtMusicSearchKind = "all" | "tracks" | "albums" | "artists" | "playlists";

/** Known-good tags passed to `yt_download` so YTM tracks keep real metadata. */
export interface YtTrackMeta {
  title: string;
  artists: string[];
  album: string | null;
  coverUrl: string | null;
}

/**
 * Minimal playable shape accepted by play/download flows — the common
 * denominator of {@link YtSearchResult} and {@link YtMusicTrack}.
 */
export interface YtPlayable {
  id: string;
  title: string;
  artist: string | null;
  thumbnail: string | null;
  duration: number | null;
  /** Present for YTM tracks; improves download tags. */
  meta?: YtTrackMeta;
}

export interface YtDownloadResult {
  /** Absolute path to the downloaded audio file, ready for the import pipeline. */
  path: string;
}

/** Progress channel payload emitted by the `yt_download` command. */
export type YtDownloadEvent
  = | { type: "progress"; data: { downloaded: number; total: number | null } }
    | { type: "processing" };

export type YoutubeErrorKind
  = | "UNAVAILABLE"
    | "SEARCH_FAILED"
    | "DOWNLOAD_FAILED"
    | "IMPORT_FAILED"
    | "NOT_FOUND"
    | "UNAVAILABLE_REGION"
    | "NETWORK"
    | "CANCELLED"
    | "UNKNOWN";

export interface YoutubeError {
  kind: YoutubeErrorKind;
  message: string;
}
