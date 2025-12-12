import type { Brand } from "./branded";

export type TrackId = Brand<string, "TrackId">;
export type AlbumId = Brand<string, "AlbumId">;
export type ArtistId = Brand<string, "ArtistId">;
export type PlaylistId = Brand<string, "PlaylistId">;
// export type UserId = Brand<string, "UserId">;
export type QueueItemId = Brand<string, "QueueItemId">;

export const TrackId = (id: string) => id as TrackId;
export const AlbumId = (id: string) => id as AlbumId;
export const ArtistId = (id: string) => id as ArtistId;
export const PlaylistId = (id: string) => id as PlaylistId;
// export const UserId = (id: string) => id as UserId;
export const QueueItemId = (id: string) => id as QueueItemId;
