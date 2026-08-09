import { readonly, ref, watch, type Ref, type WatchSource } from "vue";
import { useTimeoutFn } from "@vueuse/core";

export interface DelayedIndicatorOptions {
  /** How long the source must stay truthy before the indicator shows. */
  delayMs?: number;
  /** Once shown, the minimum time the indicator stays visible. */
  minVisibleMs?: number;
}

/**
 * Turns a boolean "busy" source into a spinner-friendly flag: the indicator
 * appears only when the source stays truthy past `delayMs`, so fast operations
 * never flash a loader, and once shown it stays up for at least `minVisibleMs`
 * so borderline-slow operations don't blink it.
 *
 * Timers are bound to the current effect scope (component or store) and are
 * cleaned up with it.
 */
export function useDelayedIndicator(
  source: WatchSource<boolean>,
  options: DelayedIndicatorOptions = {},
): Readonly<Ref<boolean>> {
  const { delayMs = 300, minVisibleMs = 250 } = options;

  const isVisible = ref(false);
  let shownAt = 0;
  let hideDelayMs = 0;

  const show = useTimeoutFn(() => {
    shownAt = Date.now();
    isVisible.value = true;
  }, delayMs, { immediate: false });

  const hide = useTimeoutFn(() => {
    isVisible.value = false;
  }, () => hideDelayMs, { immediate: false });

  watch(source, (active) => {
    show.stop();

    if (active) {
      hide.stop();
      if (!isVisible.value) show.start();
      return;
    }

    if (!isVisible.value) return;

    hideDelayMs = minVisibleMs - (Date.now() - shownAt);
    if (hideDelayMs <= 0) {
      isVisible.value = false;
    }
    else {
      hide.start();
    }
  });

  return readonly(isVisible);
}
