import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { usePlayerStore } from "./player.store";
import { findActiveLyricsIndex, type LyricsLine } from "../lib/lrc";
import { loadTrackLyrics } from "../service/track-lyrics-loader.service";
import { isLibraryTrack, type PlayerTrack } from "../types";

export type LyricsStatus = "idle" | "loading" | "ready" | "error";

/**
 * Lyrics for the currently playing track. Loading is driven by the player
 * lifecycle (trackChanged), not by a watcher — see player-lifecycle.ts.
 */
export const useLyricsStore = defineStore("lyrics", () => {
  const playerStore = usePlayerStore();

  const lines = ref<LyricsLine[]>([]);
  const status = ref<LyricsStatus>("idle");

  let requestId = 0;

  const activeLineIndex = computed(() => {
    if (lines.value.length === 0) return -1;
    return findActiveLyricsIndex(lines.value, playerStore.currentTime);
  });

  /**
   * Loads lyrics for the given track (null clears). Guarded against
   * out-of-order completion when tracks switch quickly.
   */
  const loadFor = async (track: PlayerTrack | null): Promise<void> => {
    const id = ++requestId;
    lines.value = [];
    status.value = track && isLibraryTrack(track) ? "loading" : "idle";

    const result = await loadTrackLyrics(track);
    if (id !== requestId) return;

    lines.value = result.lines;
    status.value = result.status;
  };

  return { lines, status, activeLineIndex, loadFor };
});
