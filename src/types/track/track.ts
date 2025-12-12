import { AlbumId, ArtistId, TrackId } from "../ids";

export interface Track {
  id: TrackId;
  title: string;
  artist: string;
  artistId: ArtistId;
  albumId: AlbumId;
  albumName: string;
  cover: string;
  duration: number;
  isLiked: boolean;
}
