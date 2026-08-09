import { computed, ref, watch } from "vue";

export interface UseCountdownOptions {
  /** Fires once when the countdown reaches zero (e.g. pause playback). */
  onExpire: () => void;
}

/**
 * Countdown with a 1s-resolution remaining readout; backs the sleep timer.
 *
 * `endsAt` is the single source of truth (an absolute timestamp, so it can be
 * persisted and survive reloads): writing it arms or clears the handles via
 * the watcher. A rehydrated deadline already in the past expires immediately.
 */
export function useCountdown({ onExpire }: UseCountdownOptions) {
  const endsAt = ref<number | null>(null);
  const remainingMs = ref(0);

  const isActive = computed(() => endsAt.value !== null);

  let timeout: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;

  const clearHandles = () => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  };

  const updateRemaining = () => {
    remainingMs.value = endsAt.value === null
      ? 0
      : Math.max(0, endsAt.value - Date.now());
  };

  const cancel = () => {
    clearHandles();
    endsAt.value = null;
    remainingMs.value = 0;
  };

  const expire = () => {
    clearHandles();
    endsAt.value = null;
    remainingMs.value = 0;
    onExpire();
  };

  const set = (durationMs: number) => {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      cancel();
      return;
    }
    endsAt.value = Date.now() + durationMs;
  };

  watch(endsAt, (value) => {
    clearHandles();
    if (value === null) {
      remainingMs.value = 0;
      return;
    }

    updateRemaining();
    if (remainingMs.value <= 0) {
      expire();
      return;
    }

    interval = setInterval(updateRemaining, 1000);
    timeout = setTimeout(expire, remainingMs.value);
  }, { immediate: true });

  return { endsAt, remainingMs, isActive, set, cancel };
}
