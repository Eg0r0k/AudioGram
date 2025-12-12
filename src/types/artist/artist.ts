import { AlbumId, ArtistId, TrackId } from "../ids";

export interface Artist {
  id: ArtistId;
  name: string;
  picture: string;
  bio: string;
  albumIds?: AlbumId[];
  topTrackIds?: TrackId[];
}
