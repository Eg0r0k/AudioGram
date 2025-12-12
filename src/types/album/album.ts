import { AlbumId, ArtistId, TrackId } from "../ids";

export interface Album {
  id: AlbumId;
  name: string;
  artistId: ArtistId;
  cover: string;
  releaseDate?: string;
  trackIds?: TrackId[];
}
