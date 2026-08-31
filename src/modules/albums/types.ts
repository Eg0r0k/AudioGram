import type { AlbumId, ArtistId, TrackId } from "@/types/ids";

export interface Album {
  id: AlbumId;
  name: string;
  artistId: ArtistId;
  cover: string;
  releaseDate?: string;
  trackIds?: TrackId[];
}
