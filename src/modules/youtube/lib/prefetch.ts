import { getLogger } from "@/lib/logger";
import type { PlayerTrack } from "@/modules/player/types";
import { youtubeProvider } from "../provider";
import { ytPlayableFromEphemeral } from "./playable";

/**
 * Warms the Rust-side caches for an upcoming ytstream track: `yt_prefetch`
 * resolves the googlevideo URL AND downloads the whole audio into the backend
 * memory cache, so when the queue advances the `ytstream://` proxy answers
 * from memory and playback starts instantly. No-op for local/non-YT tracks.
 *
 * The backend keeps only the last few prefetched tracks; the TTL here just
 * deduplicates rapid queue skips. A failed prefetch is forgotten immediately —
 * playback falls back to the lazy resolve on play.
 */
const PREFETCH_TTL_MS = 30 * 60_000;
const prefetchedAt = new Map<string, number>();

export function prefetchYtStream(track: PlayerTrack | null | undefined): void {
  if (!youtubeProvider.isAvailable) return;

  const playable = ytPlayableFromEphemeral(track ?? null);
  if (!playable) return;

  const last = prefetchedAt.get(playable.id);
  if (last !== undefined && Date.now() - last < PREFETCH_TTL_MS) return;
  prefetchedAt.set(playable.id, Date.now());

  getLogger().info(`[YT] Prefetching next track: ${playable.id}`);
  youtubeProvider.prefetch(playable.id)
    .map(() => {
      getLogger().info(`[YT] Prefetched next track: ${playable.id}`);
    })
    .mapErr((error) => {
      prefetchedAt.delete(playable.id);
      getLogger().warn(`[YT] Prefetch failed for ${playable.id}: ${error.message}`);
    });
}
