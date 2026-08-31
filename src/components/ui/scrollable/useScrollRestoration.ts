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

type NumberLike = number | Ref<number>;

interface ScrollRestorationTarget {
  scrollPosition?: NumberLike;
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

const scrollStore = new Map<string, number>();

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

    scrollStore.set(key, getScrollPosition(target.scrollPosition));
  };

  const applyRestore = (target: ScrollRestorationTarget, offset: number) => {
    target.virtualizer?.measure?.();

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
