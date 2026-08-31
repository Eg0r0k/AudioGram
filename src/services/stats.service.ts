import { db } from "@/db";
import { statsRepository } from "@/db/repositories/stats.repository";
import type { AlbumId, ArtistId, TrackId } from "@/types/ids";
import { createEventHook } from "@vueuse/core";
import { getLogger } from "@/lib/logger";

const MIN_LISTEN_SECONDS = 10;
const COMPLETE_THRESHOLD = 0.8;

class StatsService {
  // Stats-query invalidation subscribes here (main.ts); the service itself
  // must not touch the query cache.
  private readonly _changed = createEventHook<void>();
  readonly onChange = this._changed.on;

  private _pendingEvent: {
    eventId: string;
    trackId: TrackId;
    artistId: ArtistId;
    albumId: AlbumId;
    startedAt: number;
    trackDuration: number;
  } | null = null;

  private async _finalizePending(
    secondsListened: number,
    skipped: boolean,
    completed = false,
  ): Promise<void> {
    const pending = this._pendingEvent;
    this._pendingEvent = null;
    if (!pending) return;

    const isCompleted = completed
      || (pending.trackDuration > 0
        && secondsListened / pending.trackDuration >= COMPLETE_THRESHOLD);
    // An interruption past the complete threshold is a finished listen, not
    // a skip — mirroring scrobbling conventions.
    const isSkipped = skipped && !isCompleted;

    await db.listenEvents.update(pending.eventId, {
      secondsListened,
      completed: isCompleted,
      skipped: isSkipped,
    });

    if (!isSkipped && secondsListened >= MIN_LISTEN_SECONDS) {
      // Read-modify-write inside one modify() so a concurrent writer cannot
      // clobber the increment.
      db.tracks
        .where("id")
        .equals(pending.trackId)
        .modify((track) => {
          track.playCount += 1;
          track.lastPlayedAt = pending.startedAt;
        })
        .catch(error => getLogger().error(`[Stats] Play count update failed for ${pending.trackId}: ${String(error)}`));
    }

    this._changed.trigger().catch(error => getLogger().error(`[Stats] Change hook failed: ${String(error)}`));
  }

  startListening(
    trackId: TrackId,
    artistId: ArtistId,
    albumId: AlbumId,
    trackDuration: number,
  ): void {
    if (this._pendingEvent) {
      this._finalizePending(0, true).catch(error => getLogger().error(`[Stats] Finalizing pending event failed: ${String(error)}`));
    }

    const eventId = crypto.randomUUID();
    const now = Date.now();

    db.listenEvents.add({
      id: eventId,
      trackId,
      artistId,
      albumId,
      startedAt: now,
      secondsListened: 0,
      trackDuration,
      completed: false,
      skipped: false,
    }).then(() => this._changed.trigger()).catch(error => getLogger().error(`[Stats] Recording listen event for ${trackId} failed: ${String(error)}`));

    this._pendingEvent = {
      eventId,
      trackId,
      artistId,
      albumId,
      startedAt: now,
      trackDuration,
    };
  }

  stopListening(
    secondsListened: number,
    options: { completed?: boolean; skipped?: boolean } = {},
  ): Promise<void> {
    if (!this._pendingEvent) return Promise.resolve();
    return this._finalizePending(secondsListened, options.skipped ?? false, options.completed ?? false);
  }

  async removeFromHistory(trackId: TrackId): Promise<void> {
    const result = await statsRepository.deleteEventsForTrack(trackId);
    if (result.isErr()) throw result.error;
    await this._changed.trigger();
  }

  async clearHistory(): Promise<void> {
    const result = await statsRepository.deleteAllEvents();
    if (result.isErr()) throw result.error;
    await this._changed.trigger();
  }
}
export const statsService = new StatsService();
