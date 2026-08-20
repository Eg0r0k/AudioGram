import { db } from "@/db";
import { trackRepository } from "@/db/repositories";
import { statsRepository } from "@/db/repositories/stats.repository";
import { AlbumId, ArtistId, TrackId } from "@/types/ids";
import { createEventHook } from "@vueuse/core";

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
      trackRepository.update(pending.trackId, {
        playCount: ((await db.tracks.get(pending.trackId))?.playCount ?? 0) + 1,
        lastPlayedAt: pending.startedAt,
      }).catch(console.error);
    }

    this._changed.trigger().catch(console.error);
  }

  startListening(
    trackId: TrackId,
    artistId: ArtistId,
    albumId: AlbumId,
    trackDuration: number,
  ): void {
    if (this._pendingEvent) {
      const elapsed = (Date.now() - this._pendingEvent.startedAt) / 1000;
      this._finalizePending(elapsed, true).catch(console.error);
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
    }).then(() => this._changed.trigger()).catch(console.error);

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
