import { ref, computed, watch, onUnmounted, onMounted } from "vue";
import { usePlayerStore } from "@/modules/player/store/player.store";

export function usePlayerProgress() {
  const playerStore = usePlayerStore();

  const isScrubbing = ref(false);
  const scrubValue = ref(0);
  const localProgress = ref(0);
  const rafId = ref<number | null>(null);
  const isTransitionEnabled = ref(true);

  const startRAF = () => {
    if (rafId.value || isScrubbing.value) return;

    const update = () => {
      if (isScrubbing.value) {
        rafId.value = null;
        return;
      }

      const player = playerStore.player;
      if (player && player.duration > 0 && isFinite(player.duration as number)) {
        localProgress.value = ((player.currentTime as number) / (player.duration as number)) * 100;
      }

      if (playerStore.isPlaying) {
        rafId.value = requestAnimationFrame(update);
      }
      else {
        rafId.value = null;
      }
    };

    rafId.value = requestAnimationFrame(update);
  };

  const stopRAF = () => {
    if (rafId.value) {
      cancelAnimationFrame(rafId.value);
      rafId.value = null;
    }
  };

  const syncProgress = () => {
    const player = playerStore.player;
    if (player && player.duration > 0 && isFinite(player.duration as number)) {
      localProgress.value = ((player.currentTime as number) / (player.duration as number)) * 100;
    }
  };

  watch(() => playerStore.isPlaying, (playing) => {
    if (playing) {
      startRAF();
    }
    else {
      stopRAF();
      syncProgress();
    }
  });

  watch(() => playerStore.currentTrack?.id, (newId, oldId) => {
    if (newId === oldId) return;
    isTransitionEnabled.value = false;
    isScrubbing.value = false;
    localProgress.value = 0;
    stopRAF();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      isTransitionEnabled.value = true;
      if (playerStore.isPlaying) startRAF();
    }));
  });

  watch(() => playerStore.status, (status) => {
    if (status === "playing" && !rafId.value && !isScrubbing.value) startRAF();
  });

  onUnmounted(stopRAF);

  const displayProgress = computed(() => {
    if (playerStore.isLiveStream) return 0;
    return isScrubbing.value ? scrubValue.value : localProgress.value;
  });

  const onScrubStart = () => {
    if (!playerStore.canSeek) return;
    isScrubbing.value = true;
    stopRAF();
  };

  const onScrub = (value: number) => {
    if (!playerStore.canSeek) return;
    scrubValue.value = value;
  };

  const onScrubEnd = () => {
    if (!playerStore.canSeek) {
      isScrubbing.value = false;
      return;
    }
    localProgress.value = scrubValue.value;
    isScrubbing.value = false;
    playerStore.seekPercent(scrubValue.value);
    if (playerStore.isPlaying) setTimeout(() => startRAF(), 50);
  };
  onMounted(() => {
    syncProgress();
    if (playerStore.isPlaying) {
      startRAF();
    }
  });
  return { displayProgress, isTransitionEnabled, isScrubbing, scrubValue, onScrubStart, onScrub, onScrubEnd };
}
