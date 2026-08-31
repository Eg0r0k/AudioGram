import { db } from "@/db";
import type { AlbumEntity, ArtistEntity, PlaylistEntity, TrackEntity } from "@/db/entities";
import type { SearchDocument } from "./types";

export function buildArtistDoc(artist: ArtistEntity): SearchDocument {
  return {
    id: `artist:${artist.id}`,
    type: "artist",
    title: artist.name,
    entityId: artist.id,
  };
}

export function buildAlbumDoc(
  album: AlbumEntity,
  artistMap: Map<string, ArtistEntity>,
): SearchDocument {
  return {
    id: `album:${album.id}`,
    type: "album",
    title: album.title,
    artist: artistMap.get(album.artistId)?.name,
    entityId: album.id,
  };
}

export function buildTrackDoc(
  track: TrackEntity,
  artistMap: Map<string, ArtistEntity>,
  albumMap: Map<string, AlbumEntity>,
): SearchDocument {
  const artists = track.artistIds
    .map(artistId => artistMap.get(artistId))
    .filter((artist): artist is ArtistEntity => !!artist);
  const album = albumMap.get(track.albumId);

  return {
    id: `track:${track.id}`,
    type: "track",
    title: track.title,
    artist: artists.length > 0 ? artists.map(a => a.name).join(", ") : track.artistName ?? "",
    album: album?.title ?? track.albumTitle ?? "",
    entityId: track.id,
    duration: track.duration,
  };
}

export function buildPlaylistDoc(playlist: PlaylistEntity): SearchDocument {
  return {
    id: `playlist:${playlist.id}`,
    type: "playlist",
    title: playlist.name,
    entityId: playlist.id,
  };
}

export async function buildTrackDocFromDb(track: TrackEntity): Promise<SearchDocument> {
  const [artists, album] = await Promise.all([
    db.artists.bulkGet(track.artistIds),
    db.albums.get(track.albumId),
  ]);
  const artistEntities = artists.filter((artist): artist is ArtistEntity => !!artist);

  return {
    id: `track:${track.id}`,
    type: "track",
    title: track.title,
    artist: artistEntities.length > 0 ? artistEntities.map(a => a.name).join(", ") : track.artistName ?? "",
    album: album?.title ?? track.albumTitle ?? "",
    entityId: track.id,
    duration: track.duration,
  };
}

export async function buildAlbumDocFromDb(album: AlbumEntity): Promise<SearchDocument> {
  const artist = await db.artists.get(album.artistId);

  return {
    id: `album:${album.id}`,
    type: "album",
    title: album.title,
    artist: artist?.name,
    entityId: album.id,
  };
}

export async function buildAllSearchDocuments(): Promise<SearchDocument[]> {
  const [allTracks, artists, albums, playlists] = await Promise.all([
    db.tracks.toArray(),
    db.artists.toArray(),
    db.albums.toArray(),
    db.playlists.toArray(),
  ]);

  // Maps keep every row (names may denormalize through shadow artists);
  // only library members become documents.
  const artistMap = new Map(artists.map(a => [a.id, a]));
  const albumMap = new Map(albums.map(a => [a.id, a]));
  const tracks = allTracks.filter(t => t.pinned !== 0);

  return [
    ...artists.filter(a => a.pinned !== 0).map(a => buildArtistDoc(a)),
    ...albums.filter(a => a.pinned !== 0).map(a => buildAlbumDoc(a, artistMap)),
    ...tracks.map(t => buildTrackDoc(t, artistMap, albumMap)),
    ...playlists.map(p => buildPlaylistDoc(p)),
  ];
}
