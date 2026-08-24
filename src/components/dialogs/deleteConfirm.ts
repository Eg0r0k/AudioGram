import type { AlbumId, ArtistId, PlaylistId } from "@/types/ids";

export type DeleteConfirmType = "playlist" | "album" | "artist";

export interface DeleteConfirmData {
  type: DeleteConfirmType;
  id: PlaylistId | AlbumId | ArtistId;
  name: string;
  trackCount: number;
  coverPath?: string;
  /**
   * Initial state of the "also delete tracks" checkbox. Defaults to off —
   * containers whose tracks would otherwise be left stranded (a downloaded
   * remote album) turn it on so the destructive default stays the old one.
   */
  defaultDeleteTracks?: boolean;
}

export interface DeleteConfirmResult {
  /** Whether the tracks inside should be removed from the library too. */
  deleteTracks: boolean;
}
