import type { AudioFormat } from "@/db/entities";
import type { AlbumId, ArtistId, PlaylistId, TrackId } from "@/types/ids";

//
// Normalized DTOs. Ids are full branded ids with the source prefix baked in
// ("nd:<id>" / "yt:<id>") — pages and pin flows never see raw remote ids.
//
/**
 * One artist credit, in the order the source lists them. `artistIds` alone
 * cannot carry this: a track credited to two artists where only one has a
 * page drops an entry there, and the remaining id no longer lines up with
 * the name it belongs to.
 */
export interface SourceArtistRef {
  /** Absent where the source names an artist it has no page for. */
  id?: ArtistId;
  name: string;
}

export interface SourceTrackDTO {
  id: TrackId;
  title: string;
  artistName?: string;
  albumTitle?: string;
  albumId?: AlbumId;
  artistIds?: ArtistId[];
  /** Ordered credits — `artistName` stays the joined display string. */
  artists?: SourceArtistRef[];
  duration?: number;
  trackNo?: number;
  discNo?: number;
  coverRef?: string;
  format?: AudioFormat;
}

export interface SourceAlbumDTO {
  id: AlbumId;
  title: string;
  artistId?: ArtistId;
  artistName?: string;
  year?: number;
  coverRef?: string;
  trackCount?: number;
}

export interface SourceArtistDTO {
  id: ArtistId;
  name: string;
  albumCount?: number;
  coverRef?: string;
}

export interface SourcePlaylistDTO {
  id: PlaylistId;
  name: string;
  trackCount: number;
  coverRef?: string;
}

/**
 * One page of a collection a source hands over piecemeal.
 *
 * The cursor is opaque and belongs to the source — YouTube's continuation
 * tokens, someone else's `next` URL. Only the source that issued one may
 * interpret it, and nothing downstream may derive a position or a total
 * from it: with cursor paging the length is unknown until the last page.
 */
export interface SourcePage<T> {
  items: T[];
  /** Continuation token, or null once the collection is exhausted. */
  cursor: string | null;
}

export type SourceErrorKind
  = | "UNAVAILABLE"
    | "AUTH"
    | "NETWORK"
    | "NOT_FOUND"
    | "PARSE"
    | "CANCELLED"
    | "UNKNOWN";

export interface SourceError {
  kind: SourceErrorKind;
  message: string;
}
