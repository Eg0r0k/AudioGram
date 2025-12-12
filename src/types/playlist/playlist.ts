import { PlaylistId, TrackId } from "../ids";

export interface Playlist {
  id: PlaylistId;
  name: string;
  description?: string;
  cover?: string;
  //   ownerId: UserId;
  trackIds: TrackId[];
  isPublic: boolean;
}
