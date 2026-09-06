import {
  computed,
  isRef,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  toRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";
import { useRoute, onBeforeRouteLeave } from "vue-router";
import type { ScrollAnchor } from "./scroll-anchor";

type NumberLike = number | Ref<number>;

export interface ScrollRestorationTarget {
  scrollPosition?: NumberLike;
  getScrollAnchor?: () => ScrollAnchor | null;
  getOffsetForAnchor?: (anchor: ScrollAnchor) => number | null;
  setScrollPositionSilently?: (offset: number) => void;
  scrollTo?: (options: {
    position: number;
    behavior?: "instant" | "auto" | "smooth";
  }) => void;
  scrollToOffset?: (
    offset: number,
    options?: { behavior?: "auto" | "smooth" },
  ) => void;
  virtualizer?: {
    measure?: () => void;
  };
  container?: Ref<HTMLElement | null> | HTMLElement | null;
}

interface UseScrollRestorationOptions {
  key?: MaybeRefOrGetter<string>;
  ready?: MaybeRefOrGetter<boolean>;
  deps?: MaybeRefOrGetter<unknown>;
}

interface SavedScroll {
  offset: number;
  anchor: ScrollAnchor | null;
}

const scrollStore = new Map<string, SavedScroll>();

function getScrollPosition(value: NumberLike | undefined): number {
  if (typeof value === "number") return value;
  return value?.value ?? 0;
}

export function useScrollRestoration(
  scrollableRef: MaybeRefOrGetter<ScrollRestorationTarget | null | undefined>,
  options: UseScrollRestorationOptions = {},
) {
  const route = useRoute();
  const targetRef = toRef(scrollableRef);

  const storageKey = computed(() => toValue(options.key) ?? route.fullPath);
  const isReady = computed(() => toValue(options.ready) ?? true);
  const deps = computed(() => toValue(options.deps));

  let restoredKey: string | null = null;
  let restoreRafId: number | null = null;

  const cancelScheduledRestore = () => {
    if (restoreRafId != null) {
      cancelAnimationFrame(restoreRafId);
      restoreRafId = null;
    }
  };

  const save = (key = storageKey.value) => {
    const target = targetRef.value;
    if (!target) return;

    scrollStore.set(key, {
      offset: getScrollPosition(target.scrollPosition),
      anchor: target.getScrollAnchor?.() ?? null,
    });
  };

  // The anchor survives rows that changed height or arrived late; the raw
  // offset is the fallback when its row is gone or the target is not virtual.
  const applyRestore = (target: ScrollRestorationTarget, saved: SavedScroll) => {
    target.virtualizer?.measure?.();

    const anchored = saved.anchor && target.getOffsetForAnchor
      ? target.getOffsetForAnchor(saved.anchor)
      : null;
    const offset = anchored ?? saved.offset;

    if (typeof target.setScrollPositionSilently === "function") {
      target.setScrollPositionSilently(offset);
      return;
    }

    if (typeof target.scrollToOffset === "function") {
      target.scrollToOffset(offset, { behavior: "auto" });
      return;
    }

    if (typeof target.scrollTo === "function") {
      target.scrollTo({ position: offset, behavior: "instant" });
      return;
    }

    const container = isRef(target.container)
      ? target.container.value
      : target.container;

    if (container instanceof HTMLElement) {
      container.scrollTop = offset;
    }
  };

  const restore = async (force = false) => {
    const key = storageKey.value;

    if (!force && restoredKey === key) return;
    if (!isReady.value) return;

    const saved = scrollStore.get(key);

    if (saved == null) {
      restoredKey = key;
      return;
    }

    const target = targetRef.value;
    if (!target) return;

    await nextTick();
    await nextTick();

    cancelScheduledRestore();

    restoreRafId = requestAnimationFrame(() => {
      applyRestore(target, saved);
      restoredKey = key;
      restoreRafId = null;
    });
  };

  watch(
    storageKey,
    async (_newKey, oldKey) => {
      if (oldKey) {
        save(oldKey);
      }

      restoredKey = null;
      await restore(true);
    },
  );

  watch(
    [targetRef, isReady, deps],
    () => {
      restore().catch(() => {});
    },
    { flush: "post" },
  );

  onMounted(() => {
    restore(true).catch(() => {});
  });

  onActivated(() => {
    restore(true).catch(() => {});
  });

  onDeactivated(() => {
    save();
  });

  onBeforeRouteLeave(() => {
    save();
    restoredKey = null;
  });

  onBeforeUnmount(() => {
    save();
    cancelScheduledRestore();
  });

  return {
    save,
    restore,
  };
}
