import { ndAlbumId, ndArtistId, ndTrackId } from "@/types/track-ref";
import type { SourceAlbumDTO, SourceArtistDTO, SourcePlaylistDTO, SourceTrackDTO } from "../types";
import type { SubsonicAlbum, SubsonicArtist, SubsonicPlaylist, SubsonicSong } from "./api/types";

//
// Subsonic → normalized DTO mapping. Ids leave here already branded with the
// nd: prefix; nothing downstream ever sees a raw Subsonic id.
//

export function mapNdSong(song: SubsonicSong): SourceTrackDTO {
  return {
    id: ndTrackId(song.id),
    title: song.title,
    artistName: song.artist,
    albumTitle: song.album,
    albumId: song.albumId ? ndAlbumId(song.albumId) : undefined,
    artistIds: song.artistId ? [ndArtistId(song.artistId)] : undefined,
    duration: song.duration,
    trackNo: song.track,
    discNo: song.discNumber,
    coverRef: song.coverArt,
    format: song.suffix || song.bitRate
      ? { codec: song.suffix, bitrate: song.bitRate }
      : undefined,
  };
}

export function mapNdAlbum(album: SubsonicAlbum): SourceAlbumDTO {
  return {
    id: ndAlbumId(album.id),
    title: album.name,
    artistId: album.artistId ? ndArtistId(album.artistId) : undefined,
    artistName: album.artist,
    year: album.year,
    coverRef: album.coverArt,
    trackCount: album.songCount,
  };
}

export function mapNdArtist(artist: SubsonicArtist): SourceArtistDTO {
  return {
    id: ndArtistId(artist.id),
    name: artist.name,
    albumCount: artist.albumCount,
    coverRef: artist.coverArt,
  };
}

export function mapNdPlaylist(playlist: SubsonicPlaylist): SourcePlaylistDTO {
  return {
    id: playlist.id,
    name: playlist.name,
    trackCount: playlist.songCount ?? 0,
    coverRef: playlist.coverArt,
  };
}
