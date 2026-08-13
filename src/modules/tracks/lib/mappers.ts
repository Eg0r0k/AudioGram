import type { AlbumEntity, ArtistEntity, TrackEntity } from "@/db/entities";
import type { Track } from "@/modules/player/types";

export function mapTrack(
  entity: TrackEntity,
  artists: ArtistEntity[],
  album: AlbumEntity | null | undefined,
): Track {
  const artist = artists.length > 0
    ? artists.map(a => a.name).join(", ")
    : entity.artistName ?? "";

  return {
    kind: "library",
    id: entity.id,
    title: entity.title,
    artist,
    artistIds: entity.artistIds,
    albumId: entity.albumId,
    albumName: album?.title ?? entity.albumTitle ?? "",
    storagePath: entity.storagePath ?? "",
    source: entity.source,
    state: entity.state,
    pinned: entity.pinned,
    duration: entity.duration,
    isLiked: !!entity.likedAt,
    playCount: entity.playCount,
    addedAt: entity.addedAt,
    trackNo: entity.trackNo,
    diskNo: entity.diskNo,
    lyricsPath: entity.lyricsPath,
    integratedLufs: entity.integratedLufs,
    truePeakDbtp: entity.truePeakDbtp,
    replayGainDb: entity.replayGainDb,
    replayPeak: entity.replayPeak,
  };
}

export function mapTracks(
  entities: TrackEntity[],
  artists: ArtistEntity[],
  albums: AlbumEntity[],
): Track[] {
  const artistMap = new Map(artists.map(artist => [artist.id, artist]));
  const albumMap = new Map(albums.map(album => [album.id, album]));

  return entities.map((entity) => {
    const artistList = entity.artistIds.map(id => artistMap.get(id)).filter((a): a is ArtistEntity => !!a);
    const albumEntity = albumMap.get(entity.albumId) ?? null;
    return mapTrack(entity, artistList, albumEntity);
  });
}
