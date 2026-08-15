//
// Subsonic response payload shapes — only the fields the mappers read.
// Field names follow the Subsonic JSON API verbatim.
//

/** A song entry ("Child" in Subsonic terms). */
export interface SubsonicSong {
  id: string;
  title: string;
  album?: string;
  albumId?: string;
  artist?: string;
  artistId?: string;
  duration?: number;
  track?: number;
  discNumber?: number;
  coverArt?: string;
  suffix?: string;
  bitRate?: number;
}

export interface SubsonicArtist {
  id: string;
  name: string;
  albumCount?: number;
  coverArt?: string;
}

export interface SubsonicAlbum {
  id: string;
  name: string;
  artist?: string;
  artistId?: string;
  year?: number;
  coverArt?: string;
  songCount?: number;
}

export interface SubsonicPlaylist {
  id: string;
  name: string;
  songCount?: number;
  coverArt?: string;
}

export interface GetArtistsPayload {
  artists?: {
    ignoredArticles?: string;
    index?: { name?: string; artist?: SubsonicArtist[] }[];
  };
}

export interface GetArtistPayload {
  artist?: SubsonicArtist & { album?: SubsonicAlbum[] };
}

export interface GetAlbumPayload {
  album?: SubsonicAlbum & { song?: SubsonicSong[] };
}

export interface GetAlbumList2Payload {
  albumList2?: { album?: SubsonicAlbum[] };
}

export interface GetPlaylistsPayload {
  playlists?: { playlist?: SubsonicPlaylist[] };
}

export interface GetPlaylistPayload {
  playlist?: SubsonicPlaylist & { entry?: SubsonicSong[] };
}

export interface Search3Payload {
  searchResult3?: {
    song?: SubsonicSong[];
    album?: SubsonicAlbum[];
    artist?: SubsonicArtist[];
  };
}

export interface GetSongPayload {
  song?: SubsonicSong;
}
