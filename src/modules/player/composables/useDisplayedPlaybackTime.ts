import { computed, ref, watch } from "vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useDelayedIndicator } from "@/modules/player/composables/useDelayedIndicator";

// Same budget as the loading spinner: local tracks report their duration
// well within it, so the numbers switch once, straight to the new track.
const UNKNOWN_PLACEHOLDER_DELAY_MS = 300;

/**
 * Position and duration for time displays, without the `0:00 / 0:00` frame
 * between tracks.
 *
 * On a switch the store zeroes both and reports the real duration only once
 * the source has loaded. Until then the previous pair is held on screen so
 * the display changes exactly once (`2:31 / 3:45` → `0:00 / 4:10`) — the
 * same rule the cover follows. If the duration is still unknown after the
 * spinner's delay, `duration` becomes `null` for the caller to render a
 * placeholder instead of stale digits.
 */
export const useDisplayedPlaybackTime = () => {
  const playerStore = usePlayerStore();

  const isDurationUnknown = computed(
    () => playerStore.currentTrack !== null && playerStore.duration === null,
  );
  const showPlaceholder = useDelayedIndicator(isDurationUnknown, {
    delayMs: UNKNOWN_PLACEHOLDER_DELAY_MS,
    minVisibleMs: 0,
  });

  const held = ref({ current: 0, duration: 0 });
  watch(
    [() => playerStore.currentTime, () => playerStore.duration, isDurationUnknown],
    ([current, duration, unknown]) => {
      if (unknown || duration === null) return;
      held.value = { current, duration };
    },
    { immediate: true },
  );

  const currentTime = computed(() => (showPlaceholder.value ? 0 : held.value.current));
  const duration = computed<number | null>(() => (showPlaceholder.value ? null : held.value.duration));

  return { currentTime, duration, isDurationUnknown };
};
