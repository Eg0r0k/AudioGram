import { db } from "@/db";
import { trackRepository } from "@/db/repositories";
import { AlbumId, ArtistId, TrackId } from "@/types/ids";
import { queryClient } from "@/queries/client";
import { invalidateStatsQueries } from "@/queries/stats.queries";

const MIN_LISTEN_SECONDS = 10;
const COMPLETE_THRESHOLD = 0.8;

class StatsService {
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

    await db.listenEvents.update(pending.eventId, {
      secondsListened,
      completed: isCompleted,
      skipped,
    });

    if (!skipped && secondsListened >= MIN_LISTEN_SECONDS) {
      trackRepository.update(pending.trackId, {
        playCount: ((await db.tracks.get(pending.trackId))?.playCount ?? 0) + 1,
        lastPlayedAt: pending.startedAt,
      }).catch(console.error);
    }

    invalidateStatsQueries(queryClient).catch(console.error);
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
    }).then(() => invalidateStatsQueries(queryClient)).catch(console.error);

    this._pendingEvent = {
      eventId,
      trackId,
      artistId,
      albumId,
      startedAt: now,
      trackDuration,
    };
  }

  stopListening(secondsListened: number, completed = false): Promise<void> {
    if (!this._pendingEvent) return Promise.resolve();
    return this._finalizePending(secondsListened, false, completed);
  }
}
export const statsService = new StatsService();
