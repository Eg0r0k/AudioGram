import { ref, computed, watch, effectScope, onScopeDispose, type Ref, type EffectScope } from "vue";
import { usePlayerStore } from "@/modules/player/store/player.store";

// Smallest change of the bar worth a render, in percent: 0.05 % is a fifth
// of a pixel on a phone-wide bar. The rAF below runs at the display rate
// (120 Hz on many phones) and every write re-renders each RangeSelector on
// screen — the full player's and the mini player's under it — plus the
// mini card; on a long track that was ~10 % of the main thread for
// movement no one can see.
const PROGRESS_EPSILON = 0.05;

interface ProgressTicker {
  scope: EffectScope;
  progress: Ref<number>;
  isTransitionEnabled: Ref<boolean>;
  subscribers: number;
}

// One rAF loop for every bar on screen. Each usePlayerProgress instance used
// to run its own, and the mobile layout mounts two at once (mini player and
// full player): two loops reading the media element and writing two refs
// per frame for one position.
let ticker: ProgressTicker | null = null;

const createTicker = (): ProgressTicker => {
  const scope = effectScope(true);
  const progress = ref(0);
  const isTransitionEnabled = ref(true);

  scope.run(() => {
    const playerStore = usePlayerStore();
    let rafId: number | null = null;

    const readProgress = (): number | null => {
      const player = playerStore.player;
      if (!player || player.duration <= 0 || !isFinite(player.duration)) return null;
      return ((player.currentTime as number) / (player.duration as number)) * 100;
    };

    const stop = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    };

    const start = () => {
      if (rafId !== null) return;
      const update = () => {
        const next = readProgress();
        if (next !== null && Math.abs(next - progress.value) >= PROGRESS_EPSILON) progress.value = next;
        rafId = playerStore.isPlaying ? requestAnimationFrame(update) : null;
      };
      rafId = requestAnimationFrame(update);
    };

    const sync = () => {
      const next = readProgress();
      if (next !== null) progress.value = next;
    };

    watch(() => playerStore.isPlaying, (playing) => {
      if (playing) {
        start();
      }
      else {
        stop();
        sync();
      }
    });

    // The bar snaps to zero without animating, then transitions come back
    // once that frame has painted.
    const resumeTransitions = () => {
      isTransitionEnabled.value = true;
      if (playerStore.isPlaying) start();
    };

    const onTrackChanged = () => {
      isTransitionEnabled.value = false;
      progress.value = 0;
      stop();
      requestAnimationFrame(() => requestAnimationFrame(resumeTransitions));
    };

    watch(() => playerStore.currentTrack?.id, (newId, oldId) => {
      if (newId !== oldId) onTrackChanged();
    });

    watch(() => playerStore.status, (status) => {
      if (status === "playing") start();
    });

    sync();
    if (playerStore.isPlaying) start();
    onScopeDispose(stop);
  });

  return { scope, progress, isTransitionEnabled, subscribers: 0 };
};

const subscribe = (): ProgressTicker => {
  ticker ??= createTicker();
  ticker.subscribers++;
  const current = ticker;
  onScopeDispose(() => {
    current.subscribers--;
    if (current.subscribers === 0 && ticker === current) {
      current.scope.stop();
      ticker = null;
    }
  });
  return current;
};

export function usePlayerProgress() {
  const playerStore = usePlayerStore();
  const shared = subscribe();

  const isScrubbing = ref(false);
  const scrubValue = ref(0);

  const displayProgress = computed(() => {
    if (playerStore.isLiveStream) return 0;
    return isScrubbing.value ? scrubValue.value : shared.progress.value;
  });

  const onScrubStart = () => {
    if (!playerStore.canSeek) return;
    isScrubbing.value = true;
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
    // Optimistic: the element's position moves synchronously on seek, so the
    // next frame reads the target back; until then the bar holds it.
    shared.progress.value = scrubValue.value;
    isScrubbing.value = false;
    playerStore.seekPercent(scrubValue.value);
  };

  return {
    displayProgress,
    isTransitionEnabled: shared.isTransitionEnabled,
    isScrubbing,
    scrubValue,
    onScrubStart,
    onScrub,
    onScrubEnd,
  };
}
