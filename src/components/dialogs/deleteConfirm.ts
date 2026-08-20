import type { AlbumId, ArtistId, PlaylistId } from "@/types/ids";

export type DeleteConfirmType = "playlist" | "album" | "artist";

export interface DeleteConfirmData {
  type: DeleteConfirmType;
  id: PlaylistId | AlbumId | ArtistId;
  name: string;
  trackCount: number;
  coverPath?: string;
}
