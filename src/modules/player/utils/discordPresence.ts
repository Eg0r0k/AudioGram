import type { PlayerTrack } from "../types";

export const DISCORD_POSITION_BUCKET_SECONDS = 15;

export interface DiscordActivityPayload {
  clientId: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  position?: number;
}

export interface DiscordActivitySource {
  clientId: string;
  track: PlayerTrack | null;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
}

export function createDiscordActivityPayload(source: DiscordActivitySource): DiscordActivityPayload | null {
  const { clientId, currentTime, duration, isPlaying, track } = source;
  if (!track || !isPlaying) return null;

  return {
    clientId,
    title: normalizePresenceText(track.title) ?? "Unknown track",
    artist: normalizePresenceText(track.artist),
    album: normalizePresenceText(track.albumName),
    duration: normalizePositiveNumber(duration || track.duration),
    position: normalizePositiveNumber(currentTime),
  };
}

export function getDiscordPositionBucket(currentTime: number): number {
  return Math.floor(currentTime / DISCORD_POSITION_BUCKET_SECONDS);
}

function normalizePresenceText(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

function normalizePositiveNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}
