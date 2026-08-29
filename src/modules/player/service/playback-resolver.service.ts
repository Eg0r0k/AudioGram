import { ResultAsync, errAsync, okAsync, ok, err, type Result } from "neverthrow";
import { TrackSource, TrackState } from "@/db/entities";
import type { StorageError } from "@/db/errors/storage.errors";
import type { SourceError } from "@/types/source-dto";
import { platformCaps } from "@/lib/environment/platformCaps";
import { storageService } from "@/db/storage";
import { offlineCopyRepository } from "@/db/repositories";
import { sources } from "@/modules/sources";
import { ensurePinned } from "@/modules/tracks/lib/ensurePinned";
import { getLogger } from "@/lib/logger";
import {
  type PlayerTrack,
  type EphemeralTrack,
  type Track,
  isEphemeralTrack,
  isLibraryTrack,
} from "../types";

/**
 * Why playback could not start, as data. The store turns this into a
 * {@link PlaybackFailure} for callers that skip on failure (queue.store);
 * the kind is what lets them tell "skip this track" from "stop everything".
 */
export type PlaybackError
  = | { kind: "broken"; trackId: string }
    | { kind: "unavailable"; reason: string }
    | { kind: "storage"; cause: StorageError }
    | { kind: "source"; cause: SourceError }
    | { kind: "engine"; cause: Error }
    | { kind: "timeout"; phase: "resolving" | "loading" };

/** What the engine should load. HLS is decided here, not at load time. */
export type PlaybackSource
  = | { kind: "url"; url: string; corsFallback?: boolean }
    | { kind: "hls"; url: string }
    | { kind: "file"; file: File };

export class PlaybackFailure extends Error {
  constructor(
    public readonly error: PlaybackError,
    track: PlayerTrack,
  ) {
    super(describePlaybackError(error, track));
    this.name = "PlaybackFailure";
  }
}

export const describePlaybackError = (error: PlaybackError, track: PlayerTrack): string => {
  switch (error.kind) {
    case "broken": return `Track is marked as broken: "${track.title}"`;
    case "unavailable": return `Cannot resolve audio source for "${track.title}": ${error.reason}`;
    case "storage": return error.cause.message;
    case "source": return `[${error.cause.kind}] ${error.cause.message}`;
    case "engine": return error.cause.message;
    case "timeout": return `Timed out while ${error.phase} "${track.title}"`;
  }
};

/** Wraps whatever the engine threw so every failure leaving the store carries a kind. */
export const toPlaybackFailure = (thrown: unknown, track: PlayerTrack): PlaybackFailure => {
  if (thrown instanceof PlaybackFailure) return thrown;
  const cause = thrown instanceof Error ? thrown : new Error(String(thrown));
  return new PlaybackFailure({ kind: "engine", cause }, track);
};

/** Precondition for switching to a track — checked before the switch starts, so a refusal changes nothing. */
export const checkPlayable = (track: PlayerTrack): Result<void, PlaybackError> => {
  if (isLibraryTrack(track) && track.state === TrackState.BROKEN) {
    return err({ kind: "broken", trackId: track.id });
  }
  return ok(undefined);
};

/** Sources whose duration is unknown until the stream settles (radio, HLS): a zero duration means live, not loading. */
export const isStreamingTrack = (track: PlayerTrack): boolean => {
  if (isEphemeralTrack(track)) return track.source.type === "url";
  return track.source === TrackSource.REMOTE_HLS;
};

const classifyUrl = (url: string, options: { corsFallback?: boolean } = {}): PlaybackSource => {
  const isHls = url.includes(".m3u8") || url.includes("application/vnd.apple.mpegurl");
  if (isHls) return { kind: "hls", url };
  return options.corsFallback ? { kind: "url", url, corsFallback: true } : { kind: "url", url };
};

const fromStorage = (path: string): ResultAsync<PlaybackSource, PlaybackError> =>
  storageService.getAudioUrl(path)
    .map(url => classifyUrl(url))
    .mapErr((cause): PlaybackError => ({ kind: "storage", cause }));

const unavailable = (reason: string): ResultAsync<never, PlaybackError> =>
  errAsync({ kind: "unavailable", reason });

const resolveEphemeral = (track: EphemeralTrack): ResultAsync<PlaybackSource, PlaybackError> => {
  switch (track.source.type) {
    case "file": {
      // A File does not survive persistence: after a reload the restored
      // track carries an empty object where the handle was.
      if (!(track.source.file instanceof File)) {
        return unavailable("the dropped file did not survive a reload");
      }
      return okAsync({ kind: "file", file: track.source.file });
    }
    case "path":
      if (!platformCaps.hasFs) return unavailable("path-based ephemeral tracks require native FS");
      return fromStorage(track.source.path);
    case "url":
      return okAsync(classifyUrl(track.source.url, { corsFallback: true }));
  }
};

const resolveRemote = (track: Track): ResultAsync<PlaybackSource, PlaybackError> => {
  // Playing from live browsing shadow-pins the row (pinned = 0) so
  // history, stats and queue persistence have valid FKs. Fire-and-forget:
  // playback must not wait for the cascade.
  if (track.sourceDto) {
    ensurePinned({ kind: "remote", dto: track.sourceDto }, { pinned: 0 }).catch((error) => {
      getLogger().warn(`[Player] Shadow-pin failed for ${track.id}: ${String(error)}`);
    });
  }

  // A failed lookup is treated as "no copy": the stream is still playable.
  return ResultAsync.fromSafePromise(offlineCopyRepository.findById(track.id))
    .andThen((copyResult) => {
      const copy = copyResult.isOk() ? copyResult.value : undefined;
      if (copy) return fromStorage(copy.storagePath);
      return sources.forTrack(track.id).resolveStreamUrl(track.id)
        .map(url => classifyUrl(url))
        .mapErr((cause): PlaybackError => ({ kind: "source", cause }));
    });
};

const resolveLibrary = (track: Track): ResultAsync<PlaybackSource, PlaybackError> => {
  // REMOTE_HLS: storagePath IS the stream URL — folds into sources in M6.
  if (track.source === TrackSource.REMOTE_HLS) {
    if (!track.storagePath) return unavailable("HLS track has no stream URL");
    return okAsync(classifyUrl(track.storagePath));
  }

  const isRemote = track.source === TrackSource.REMOTE_SUBSONIC
    || track.source === TrackSource.REMOTE_YT;
  if (isRemote) return resolveRemote(track);

  if (track.source === TrackSource.LOCAL_EXTERNAL && !platformCaps.hasFs) {
    return unavailable("LOCAL_EXTERNAL tracks require native FS");
  }
  return fromStorage(track.storagePath);
};

/**
 * Resolves what the engine should load for any PlayerTrack — the single
 * resolution point for playback.
 *
 * Library tracks:
 *   1. local file (LOCAL_INTERNAL/LOCAL_EXTERNAL) → storageService.getAudioUrl
 *   2. remote with an offline copy → storageService.getAudioUrl(copy path)
 *   3. remote otherwise → sources.forTrack(id).resolveStreamUrl(id)
 *
 * Ephemeral tracks:
 *   file → the File itself (web drag-and-drop / file picker)
 *   path → storageService.getAudioUrl (Tauri "Open with", no import)
 *   url  → used directly (radio, YT stream proxy), with the CORS fallback
 */
export const resolvePlaybackSource = (track: PlayerTrack): ResultAsync<PlaybackSource, PlaybackError> => {
  if (isEphemeralTrack(track)) return resolveEphemeral(track);
  return resolveLibrary(track);
};
