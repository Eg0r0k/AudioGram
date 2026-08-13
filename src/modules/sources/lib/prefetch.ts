import { invoke } from "@tauri-apps/api/core";
import { getLogger } from "@/lib/logger";
import { IS_TAURI } from "@/lib/environment/userAgent";
import type { PlayerTrack } from "@/modules/player/types";
import { parseTrackRef } from "@/types/track-ref";
import { getNdConfig } from "../navidrome/config";

//
// ND counterpart of the YT prefetch: warms the Rust in-memory audio cache
// with the next queue entry so the `stream://…/nd/song/…` proxy answers from
// memory and the next track starts instantly. A failed prefetch only costs
// the head start — playback falls back to live streaming.
//

const PREFETCH_TTL_MS = 30 * 60_000;
const prefetchedAt = new Map<string, number>();

export function prefetchNdStream(track: PlayerTrack | null | undefined): void {
  if (!IS_TAURI || !track || track.kind !== "library") return;
  if (getNdConfig() === null) return;

  const ref = parseTrackRef(track.id);
  if (ref.kind !== "nd") return;

  const last = prefetchedAt.get(ref.songId);
  if (last !== undefined && Date.now() - last < PREFETCH_TTL_MS) return;
  prefetchedAt.set(ref.songId, Date.now());

  getLogger().info(`[ND] Prefetching next track: ${track.id}`);
  invoke<void>("nd_prefetch", { songId: ref.songId })
    .then(() => {
      getLogger().info(`[ND] Prefetched next track: ${track.id}`);
    })
    .catch((error) => {
      prefetchedAt.delete(ref.songId);
      getLogger().warn(`[ND] Prefetch failed for ${track.id}: ${String(error)}`);
    });
}
