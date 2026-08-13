import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { usePlayerStore } from "./player.store";
import { findActiveLyricsIndex, type LyricsLine } from "../lib/lrc";
import { loadTrackLyrics } from "../service/track-lyrics-loader.service";
import { isLibraryTrack, type PlayerTrack } from "../types";

export type LyricsStatus = "idle" | "loading" | "ready" | "error";

export const useLyricsStore = defineStore("lyrics", () => {
  const playerStore = usePlayerStore();

  const lines = ref<LyricsLine[]>([]);
  const status = ref<LyricsStatus>("idle");

  let requestId = 0;

  const activeLineIndex = computed(() => {
    if (lines.value.length === 0) return -1;
    return findActiveLyricsIndex(lines.value, playerStore.currentTime);
  });

  const loadFor = async (track: PlayerTrack | null): Promise<void> => {
    const id = ++requestId;
    lines.value = [];
    // Ephemeral tracks with metadata also resolve lyrics (lrclib lookup).
    const canHaveLyrics = track
      && (isLibraryTrack(track) || Boolean(track.title && track.artist));
    status.value = canHaveLyrics ? "loading" : "idle";

    const result = await loadTrackLyrics(track);
    if (id !== requestId) return;

    lines.value = result.lines;
    status.value = result.status;
  };

  return { lines, status, activeLineIndex, loadFor };
});
