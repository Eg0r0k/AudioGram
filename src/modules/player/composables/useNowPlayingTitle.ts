import { useTitle } from "@vueuse/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { computed, watchEffect } from "vue";
import { routeTitle } from "@/app/router/middleware/title.middleware";
import { platformCaps } from "@/lib/environment/platformCaps";
import { usePlayerStore } from "@/modules/player/store/player.store";

const UNKNOWN_ARTIST = "Unknown Artist";
const UNKNOWN_TRACK = "Unknown Track";

export const useNowPlayingTitle = () => {
  const playerStore = usePlayerStore();
  const title = useTitle();

  const nowPlayingTitle = computed(() => {
    if (!playerStore.isPlaying || !playerStore.currentTrack) {
      return routeTitle.value;
    }

    const artist = playerStore.currentTrack.artist?.trim() || UNKNOWN_ARTIST;
    const track = playerStore.currentTrack.title.trim() || UNKNOWN_TRACK;
    return `${artist} - ${track}`;
  });

  watchEffect(() => {
    const nextTitle = nowPlayingTitle.value;
    title.value = nextTitle;

    if (!platformCaps.hasNativeWindow) return;

    getCurrentWindow().setTitle(nextTitle).catch(() => {
      // noop: title sync is non-critical
    });
  });
};
