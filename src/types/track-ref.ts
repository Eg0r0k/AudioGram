import { AlbumId, ArtistId, TrackId } from "./ids";

// "radio" — M6
export type SourceKind = "local" | "nd" | "yt";

//
// Remote ids are branded composite strings ("nd:<songId>", "yt:<videoId>");
// local ids stay unprefixed (existing UUIDs) so no FK migration is needed.
//
export type TrackRef
  = | { kind: "local" }
    | { kind: "nd"; songId: string }
    | { kind: "yt"; videoId: string };

const ND_PREFIX = "nd:";
const YT_PREFIX = "yt:";

export function parseTrackRef(id: TrackId): TrackRef {
  if (id.startsWith(ND_PREFIX)) return { kind: "nd", songId: id.slice(ND_PREFIX.length) };
  if (id.startsWith(YT_PREFIX)) return { kind: "yt", videoId: id.slice(YT_PREFIX.length) };
  return { kind: "local" };
}

export const ndTrackId = (songId: string) => TrackId(`${ND_PREFIX}${songId}`);
export const ytTrackId = (videoId: string) => TrackId(`${YT_PREFIX}${videoId}`);
export const ndAlbumId = (albumId: string) => AlbumId(`${ND_PREFIX}${albumId}`);
export const ndArtistId = (artistId: string) => ArtistId(`${ND_PREFIX}${artistId}`);
// M5: yt album/artist id spaces ("yt:MPREb_…" / "yt:UC…") — the pin cascade
// can hang shadow album/artist rows off downloaded YT tracks.
export const ytAlbumId = (browseId: string) => AlbumId(`${YT_PREFIX}${browseId}`);
export const ytArtistId = (channelId: string) => ArtistId(`${YT_PREFIX}${channelId}`);
