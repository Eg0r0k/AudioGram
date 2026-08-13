import { TrackSource, TrackState } from "@/db/entities";
import type { Track } from "@/modules/player/types";
import type { AlbumData, ArtistData, PlaylistData } from "@/modules/media-hero/types";
import { AlbumId, PlaylistId } from "@/types/ids";
import { parseTrackRef, type SourceKind } from "@/types/track-ref";
import { THUMB_SIZE_FULL, THUMB_SIZE_ROW } from "@/modules/youtube/lib/thumbnail";
import { sources } from "../registry";
import type { SourceAlbumDTO, SourceArtistDTO, SourcePlaylistDTO, SourceTrackDTO } from "../types";

//
// DTO → view-model bridges: pages and shared row components keep consuming
// the same VMs (Track, AlbumData, …) regardless of the source — no template
// branching. Remote menu subjects still travel as DTOs (step 9), these are
// display-only shapes.
//

export { THUMB_SIZE_FULL, THUMB_SIZE_ROW };

export function sourceCoverUrl(kind: SourceKind, coverRef: string | undefined, size?: number): string {
  if (!coverRef || kind === "local") return "";
  return sources.get(kind).coverUrl(coverRef, size);
}

/** Source kind of any branded id string (track/album/artist/playlist). */
export function sourceKindOf(id: string): SourceKind {
  return parseTrackRef(id as Parameters<typeof parseTrackRef>[0]).kind;
}

/** Display-only Track for shared rows; never a source of DB writes. */
export function sourceTrackToDisplay(dto: SourceTrackDTO): Track {
  const kind = parseTrackRef(dto.id).kind;
  return {
    kind: "library",
    id: dto.id,
    title: dto.title,
    artist: dto.artistName ?? "",
    artistIds: dto.artistIds ?? [],
    albumId: dto.albumId ?? AlbumId(""),
    albumName: dto.albumTitle ?? "",
    storagePath: "",
    source: kind === "yt" ? TrackSource.REMOTE_YT : TrackSource.REMOTE_SUBSONIC,
    state: TrackState.READY,
    pinned: 0,
    duration: dto.duration ?? 0,
    isLiked: false,
    trackNo: dto.trackNo,
    diskNo: dto.discNo,
    sourceDto: dto,
  };
}

export function sourceAlbumToAlbumData(dto: SourceAlbumDTO, duration?: string): AlbumData {
  return {
    type: "album",
    id: dto.id,
    title: dto.title,
    artistName: dto.artistName ?? "",
    artistId: dto.artistId ?? ("" as AlbumData["artistId"]),
    image: sourceCoverUrl(sourceKindOf(dto.id), dto.coverRef, THUMB_SIZE_FULL),
    releaseYear: dto.year ?? 0,
    trackCount: dto.trackCount ?? 0,
    duration,
  };
}

export function sourceArtistToArtistData(dto: SourceArtistDTO): ArtistData {
  return {
    type: "artist",
    id: dto.id,
    title: dto.name,
    image: sourceCoverUrl(sourceKindOf(dto.id), dto.coverRef, THUMB_SIZE_FULL),
    monthlyListeners: 0,
    isFollowing: false,
  };
}

/** ND playlists are read-only server pages → isOwner: false. */
export function sourcePlaylistToPlaylistData(dto: SourcePlaylistDTO, id: PlaylistId): PlaylistData {
  return {
    type: "playlist",
    id,
    title: dto.name,
    image: sourceCoverUrl("nd", dto.coverRef, THUMB_SIZE_FULL),
    isOwner: false,
    trackCount: dto.trackCount,
  };
}
