<template>
  <div
    ref="wrapperRef"
    :class="wrapperClasses"
  >
    <div
      v-if="scrollable.USE_OWN_SCROLL && showThumbVisible"
      class="scrollable-thumb-container scrollable-thumb-container-y"
    >
      <div
        ref="thumbRef"
        class="scrollable-thumb"
        :class="{ 'is-focused': scrollable.isDragging.value }"
        :style="thumbStyle"
        @mousedown="scrollable.handleThumbMouseDown"
      />
    </div>

    <div
      ref="containerRef"
      :class="containerClasses"
      @scroll="handleScroll"
    >
      <div ref="beforeRef">
        <slot name="before" />
      </div>

      <div
        v-if="$slots.sticky"
        ref="stickyRef"
        class="virtual-scrollable-sticky"
        :style="stickyStyle"
      >
        <slot name="sticky" />
      </div>

      <div
        v-if="items.length > 0"
        :style="{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }"
      >
        <div
          v-for="virtualRow in (rowsReady ? virtualizer.getVirtualItems() : [])"
          :key="String(virtualRow.key)"
          :ref="(el) => measureElement(el as Element | null)"
          :data-index="virtualRow.index"
          :data-vkey="String(virtualRow.key)"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualRow.start - preListHeight + effectivePaddingTop}px)`,
          }"
        >
          <slot
            :item="items[virtualRow.index]"
            :index="virtualRow.index"
            :virtual-row="virtualRow"
          />
        </div>
      </div>

      <div
        v-if="loading"
      >
        <slot name="loader" />
      </div>

      <div
        v-if="!loading && items.length === 0"
      >
        <slot name="empty" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import { useVirtualizer, type VirtualItem } from "@tanstack/vue-virtual";
import { computed, nextTick, onMounted, onUnmounted, provide, ref, useTemplateRef, watch } from "vue";
import { scrollableInjectionKey } from "./injection";
import type { ScrollAnchor } from "./scroll-anchor";
import { useSlideContentReady } from "@/components/transitions/slideContentReady";
import { isScrollLockedByOverlay } from "./scroll-lock";
import useScrollable from "./useScrollable";

interface Props {
  items: T[];
  estimateSize?: number;
  itemHeight?: number;
  overscan?: number;
  getItemKey?: (index: number) => string | number;
  loading?: boolean;
  bordered?: boolean;
  hideThumb?: boolean;
  loadMoreOffset?: number;
  paddingTop?: number;
  paddingBottom?: number;
  stickyOffset?: string;
  /** FLIP-slide rows to their new offsets when `items` reorders. */
  animateReorder?: boolean;
  /** Keep the first visible row in place when `items` changes above it. */
  keepScrollAnchor?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  estimateSize: 64,
  itemHeight: undefined,
  overscan: 5,
  getItemKey: (index: number) => index,
  loading: false,
  bordered: false,
  hideThumb: false,
  loadMoreOffset: 300,
  paddingTop: 0,
  paddingBottom: 0,
  stickyOffset: "0px",
  animateReorder: false,
  keepScrollAnchor: false,
});

const emit = defineEmits<{
  scroll: [event: Event];
  scrolledTop: [];
  scrolledBottom: [];
  loadMore: [];
}>();

const beforeHeight = ref(0);
const stickyHeight = ref(0);
const preListHeight = computed(() => beforeHeight.value + stickyHeight.value);

// Rows wait for two things: the before/sticky slots measured (so the first
// row render already has the right scrollMargin instead of being redone), and
// the enclosing slide transition running — mounting dozens of rows is the
// heaviest part of a page and must not sit between the click and the first
// frame of motion.
const headerMeasured = ref(false);
const contentReady = useSlideContentReady();
const rowsReady = computed(() => headerMeasured.value && contentReady.value);

const effectivePaddingTop = computed(() =>
  props.items.length > 0 ? props.paddingTop : 0,
);

const effectivePaddingBottom = computed(() =>
  props.items.length > 0 ? props.paddingBottom : 0,
);

const totalSize = computed(() => {
  if (props.items.length === 0) {
    return 0;
  }
  return virtualizer.value.getTotalSize() + effectivePaddingTop.value + effectivePaddingBottom.value;
});

const containerRef = useTemplateRef("containerRef");
const beforeRef = useTemplateRef("beforeRef");
const stickyRef = useTemplateRef("stickyRef");

let beforeResizeObserver: ResizeObserver | null = null;
let stickyResizeObserver: ResizeObserver | null = null;
let mountFrame: number | null = null;
let lastLoadMoreItemsCount = -1;
let scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function updateBeforeHeight() {
  const newHeight = beforeRef.value?.getBoundingClientRect().height ?? 0;
  if (beforeHeight.value !== newHeight) {
    beforeHeight.value = newHeight;
    virtualizer.value.measure();
    scrollable.updateThumb();
  }
}

function updateStickyHeight() {
  const newHeight = stickyRef.value?.getBoundingClientRect().height ?? 0;
  if (stickyHeight.value !== newHeight) {
    stickyHeight.value = newHeight;
    virtualizer.value.measure();
    scrollable.updateThumb();
  }
}

const scrollable = useScrollable(containerRef, {
  direction: "vertical",
  onScrollOffset: props.loadMoreOffset,
  onScrolledTop: () => emit("scrolledTop"),
});

// A list must not scroll away under an anchored context menu / dropdown.
watch(isScrollLockedByOverlay, locked => scrollable.setScrollLocked(locked));

const virtualizer = useVirtualizer(computed(() => ({
  count: props.items.length,
  getScrollElement: () => containerRef.value,
  estimateSize: () => props.itemHeight ?? props.estimateSize,
  overscan: props.overscan,
  getItemKey: index => props.getItemKey(index),
  scrollMargin: preListHeight.value,
})));

const measureElement = (el: Element | null) => {
  if (el && !props.itemHeight) {
    virtualizer.value.measureElement(el);
  }
};

// One programmatic move must not read as a user scroll: no `scroll` emit,
// no loadMore, no direction change downstream. The browser fires the event
// before the next frame, so the frame callback only mops up a clamped move
// that produced no event.
let skipNextScroll = false;

const setScrollPositionSilently = (offset: number) => {
  const container = containerRef.value;
  if (!container || container.scrollTop === offset) return;
  skipNextScroll = true;
  scrollable.setScrollPositionSilently(offset);
  requestAnimationFrame(() => {
    skipNextScroll = false;
  });
};

const handleScroll = (e: Event) => {
  if (scrollDebounceTimer) {
    clearTimeout(scrollDebounceTimer);
  }
  scrollDebounceTimer = setTimeout(() => {
    scrollable.updateThumb();
  }, 16);

  if (skipNextScroll) {
    skipNextScroll = false;
    return;
  }

  const target = e.target as HTMLElement;
  const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

  if (
    props.items.length > 0
    && !props.loading
    && distanceToBottom <= props.loadMoreOffset
    && lastLoadMoreItemsCount !== props.items.length
  ) {
    lastLoadMoreItemsCount = props.items.length;
    emit("scrolledBottom");
    emit("loadMore");
  }

  emit("scroll", e);
};

const wrapperClasses = computed(() => [
  "scrollable-wrapper",
  "scrollable-direction-y",
  {
    "scrollable-y-bordered": props.bordered,
    "scrolled-start": props.bordered && scrollable.isScrolledToStart.value,
    "scrolled-end": props.bordered && scrollable.isScrolledToEnd.value,
  },
]);

const containerClasses = computed(() => [
  "scrollable",
  "scrollable-y",
  {
    "no-scrollbar": scrollable.USE_OWN_SCROLL,
    "no-scrollbar-safari": scrollable.IS_SAFARI && !scrollable.IS_MOBILE_SAFARI,
  },
]);

const showThumbVisible = computed(
  () => !props.hideThumb && scrollable.thumbSize.value > 0,
);

const thumbStyle = computed(() => ({
  height: `${scrollable.thumbSize.value}px`,
  transform: `translateY(${scrollable.thumbPosition.value}px)`,
}));

const stickyStyle = computed(() => ({
  top: props.stickyOffset,
}));

provide(scrollableInjectionKey, scrollable);

interface ScrollToIndexOptions {
  align?: "start" | "center" | "end" | "auto";
  behavior?: "auto" | "smooth";
}

const scrollToIndex = (index: number, options?: ScrollToIndexOptions) => {
  if (index >= 0 && index < props.items.length) {
    virtualizer.value.scrollToIndex(index, options);
  }
};

const scrollToOffset = (offset: number, options?: { behavior?: "auto" | "smooth" }) => {
  virtualizer.value.scrollToOffset(offset, options);
};

const rowTop = (start: number) => start + effectivePaddingTop.value;

const firstRowBelow = (measurements: readonly VirtualItem[], offset: number) => {
  let low = 0;
  let high = measurements.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (measurements[mid].end > offset) {
      found = mid;
      high = mid - 1;
    }
    else {
      low = mid + 1;
    }
  }
  return found;
};

const anchorsAt = (
  measurements: readonly VirtualItem[],
  keys: (string | number)[],
  scrollTop: number,
  viewportBottom: number,
) => {
  const first = firstRowBelow(measurements, scrollTop - effectivePaddingTop.value);
  if (first === -1) return [];
  const anchors: ScrollAnchor[] = [];
  for (let index = first; index < measurements.length && index < keys.length; index++) {
    const top = rowTop(measurements[index].start);
    if (top >= viewportBottom && anchors.length > 0) break;
    anchors.push({ key: keys[index], delta: scrollTop - top });
  }
  return anchors;
};

const getScrollAnchor = (): ScrollAnchor | null => {
  const container = containerRef.value;
  if (!container) return null;
  const measurements = virtualizer.value.measurementsCache;
  const anchors = anchorsAt(
    measurements,
    measurements.map(item => item.key as string | number),
    container.scrollTop,
    container.scrollTop,
  );
  return anchors.length > 0 ? anchors[0] : null;
};

const getOffsetForAnchor = (anchor: ScrollAnchor): number | null => {
  const index = props.items.findIndex((_, i) => props.getItemKey(i) === anchor.key);
  if (index === -1) return null;
  virtualizer.value.getTotalSize();
  const measurements = virtualizer.value.measurementsCache;
  if (index >= measurements.length) return null;
  return rowTop(measurements[index].start) + anchor.delta;
};

const captureAnchors = (keys: (string | number)[]) => {
  const container = containerRef.value;
  if (!container || container.scrollTop <= 0 || keys.length === 0) return null;
  const anchors = anchorsAt(
    virtualizer.value.measurementsCache,
    keys,
    container.scrollTop,
    container.scrollTop + container.clientHeight,
  );
  return anchors.length > 0 ? anchors : null;
};

const restoreAnchors = (anchors: ScrollAnchor[]) => {
  const container = containerRef.value;
  if (!container) return;
  for (const anchor of anchors) {
    const offset = getOffsetForAnchor(anchor);
    if (offset === null) continue;
    if (Math.abs(offset - container.scrollTop) >= 1) setScrollPositionSilently(offset);
    return;
  }
};

// `items` changes for many reasons that need no work here: a query refetch
// or a like toggle hands over a fresh array with the same rows. Only a count
// change needs a re-measure (measure() drops every cached row size, so it is
// not free), and only a change in key order needs the FLIP snapshot (a
// layout read per rendered row, before and after the render).
let previousKeys: (string | number)[] = [];
const currentKeys = () => props.items.map((_, index) => props.getItemKey(index));
const keysChanged = (keys: (string | number)[]) =>
  keys.length !== previousKeys.length || keys.some((key, index) => key !== previousKeys[index]);
const tracksKeys = props.animateReorder || props.keepScrollAnchor;
if (tracksKeys) previousKeys = currentKeys();

watch([() => props.items, () => props.items.length], ([, newLength], [, oldLength]) => {
  const lengthChanged = newLength !== oldLength;
  if (newLength < oldLength || newLength === 0) {
    lastLoadMoreItemsCount = -1;
  }

  let reordered = false;
  let anchors: ScrollAnchor[] | null = null;
  if (tracksKeys) {
    if (props.keepScrollAnchor) anchors = captureAnchors(previousKeys);
    const keys = currentKeys();
    const changed = keysChanged(keys);
    previousKeys = keys;
    if (!changed) anchors = null;
    if (props.animateReorder && changed) {
      reordered = true;
      captureFlipSnapshot();
    }
  }

  if (!lengthChanged && !reordered && !anchors) return;

  nextTick(() => {
    if (lengthChanged) {
      if (!props.itemHeight) virtualizer.value.measure();
      scrollable.updateThumb();
    }
    if (reordered) playFlip();
    if (anchors) restoreAnchors(anchors);
  }).catch(() => {});
});

watch(
  () => [props.itemHeight, props.estimateSize] as const,
  () => {
    nextTick(() => {
      virtualizer.value.measure();
      scrollable.updateThumb();
    }).catch(() => {});
  },
);

watch(
  () => [props.paddingTop, props.paddingBottom] as const,
  () => {
    if (props.items.length > 0) {
      nextTick(() => {
        virtualizer.value.measure();
        scrollable.updateThumb();
      }).catch(() => {});
    }
  },
);

// ── FLIP reorder animation ──────────────────────────────────────────────────
// A CSS transition on the row transform is not enough: when the order
// changes, Vue MOVES the reordered node in the DOM (insertBefore), which
// kills any running/starting transition — the moved row teleports while its
// neighbours slide. FLIP survives the move: old tops are captured before the
// re-render (pre-flush watch), and after it each surviving row plays a
// WAAPI delta with `composite: "add"`, leaving the positioning transform
// untouched.

const FLIP_DURATION_MS = 300;
const FLIP_EASING = "cubic-bezier(0.23, 1, 0.32, 1)";
let flipSnapshot: Map<string, number> | null = null;

const captureFlipSnapshot = () => {
  const container = containerRef.value;
  const reducedMotion = typeof matchMedia !== "undefined"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!container || reducedMotion) {
    flipSnapshot = null;
    return;
  }
  flipSnapshot = new Map();
  for (const el of container.querySelectorAll<HTMLElement>("[data-vkey]")) {
    flipSnapshot.set(el.dataset.vkey ?? "", el.getBoundingClientRect().top);
  }
};

const playFlip = () => {
  const snapshot = flipSnapshot;
  flipSnapshot = null;
  const container = containerRef.value;
  if (!snapshot || !container) return;
  for (const el of container.querySelectorAll<HTMLElement>("[data-vkey]")) {
    const previousTop = snapshot.get(el.dataset.vkey ?? "");
    if (previousTop === undefined) continue;
    const delta = previousTop - el.getBoundingClientRect().top;
    if (Math.abs(delta) < 1) continue;
    el.animate(
      [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0px)" }],
      { duration: FLIP_DURATION_MS, easing: FLIP_EASING, composite: "add" },
    );
  }
};

const measureHeaderNextFrame = () => {
  mountFrame = requestAnimationFrame(() => {
    mountFrame = null;
    updateBeforeHeight();
    updateStickyHeight();
    headerMeasured.value = true;

    if (beforeRef.value && typeof ResizeObserver !== "undefined") {
      beforeResizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(updateBeforeHeight);
      });
      beforeResizeObserver.observe(beforeRef.value);
    }

    if (stickyRef.value && typeof ResizeObserver !== "undefined") {
      stickyResizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(updateStickyHeight);
      });
      stickyResizeObserver.observe(stickyRef.value);
    }
  });
};

onMounted(() => {
  if (contentReady.value) {
    measureHeaderNextFrame();
    return;
  }
  watch(contentReady, measureHeaderNextFrame, { once: true });
});

onUnmounted(() => {
  if (mountFrame != null) cancelAnimationFrame(mountFrame);
  beforeResizeObserver?.disconnect();
  stickyResizeObserver?.disconnect();
  if (scrollDebounceTimer) {
    clearTimeout(scrollDebounceTimer);
  }
});

defineExpose({
  beforeHeight,
  stickyHeight,
  scrollToIndex,
  scrollToOffset,
  setScrollPositionSilently,
  getScrollAnchor,
  getOffsetForAnchor,
  scrollToEnd: scrollable.scrollToEnd,
  scrollToStart: scrollable.scrollToStart,
  scrollPosition: scrollable.scrollPosition,
  isScrolledToEnd: scrollable.isScrolledToEnd,
  isScrolledToStart: scrollable.isScrolledToStart,
  container: containerRef,
  virtualizer,
});
</script>

<style>
:root {
  --z-thumb: 20;
}

html.is-firefox .scrollable-y {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0) rgba(0, 0, 0, 0);
}

html.overlay-scroll .scrollable-y:hover {
  scrollbar-color: var(--scrollbar-color) transparent;
}

html.overlay-scroll .scrollable::-webkit-scrollbar {
  width: 0.375rem;
  opacity: 0;
}

html.overlay-scroll .scrollable::-webkit-scrollbar-thumb {
  transition: opacity 0.2s ease-in-out;
  opacity: 0;
}

html.overlay-scroll .scrollable::-webkit-scrollbar-button {
  display: none;
}

html.overlay-scroll .scrollable::-webkit-scrollbar-corner {
  background-color: transparent;
}

html.overlay-scroll .scrollable:hover::-webkit-scrollbar {
  opacity: 1;
}

html.overlay-scroll .scrollable:hover::-webkit-scrollbar-thumb {
  min-height: 5rem;
  max-height: 12.5rem;
  border-radius: 3px;
  background-color: var(--scrollbar-color);
  opacity: 1;
}

html.custom-scroll .scrollable::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.scrollable-wrapper {
  position: relative;
  overflow: hidden !important;
  width: 100%;
}

.scrollable-direction-y {
  height: 100%;
}

.scrollable-direction-x {
  height: auto;
}

.scrollable {
  width: 100%;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  position: absolute;
  inset: 0;
  -webkit-overflow-scrolling: touch;
}

.virtual-scrollable-sticky {
  position: sticky;
  z-index: 10;
  background: color-mix(in oklab, var(--background) 92%, transparent);
  backdrop-filter: blur(16px);
}

.scrollable::-webkit-scrollbar {
  width: 0.375rem;
  opacity: 0;
}

.scrollable::-webkit-scrollbar-thumb {
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
}

.scrollable::-webkit-scrollbar-button {
  display: none;
}

.scrollable::-webkit-scrollbar-corner {
  background-color: transparent;
}

.scrollable:hover::-webkit-scrollbar {
  opacity: 1;
}

.scrollable-y {
  overflow-x: hidden;
  overflow-y: auto;
  overflow-y: overlay;
  scrollbar-width: none;
  overscroll-behavior-y: contain;
}

.scrollable-x {
  position: relative;
  inset: auto;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  overscroll-behavior-x: contain;
  white-space: nowrap;
}

.no-scrollbar,
.scrollable.no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.scrollable-x::-webkit-scrollbar,
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

/* Thumb */
.scrollable-thumb-container {
  position: sticky;
  top: 0;
  z-index: var(--z-thumb);
  pointer-events: none;
  height: 0;
  width: 0;
}

.scrollable-thumb-container-y {
  float: right;
  margin-right: 1px;
}

.scrollable-thumb-container-x {
  left: 0;
  right: 0;
  bottom: 2px;
  height: 6px;
}

.scrollable-thumb {
  position: absolute;
  width: 6px;
  background: var(--color-muted-foreground);
  border-radius: 3px;
  pointer-events: auto;
  cursor: default;
  opacity: 0;
  transition: opacity 0.15s ease-in-out;
  inset-inline-end: 1px;
  will-change: transform, opacity;
}

.scrollable-thumb-container-y .scrollable-thumb {
  top: 0;
  right: 0;
}

.scrollable-thumb-container-x .scrollable-thumb {
  left: 0;
  bottom: 0;
  height: 6px;
}

.scrollable-wrapper:hover .scrollable-thumb,
.scrollable-thumb.is-focused {
  opacity: 1;
}

.scrollable-thumb:hover,
.scrollable-thumb.is-focused {
  background: rgba(0, 0, 0, 0.5);
}

.scrollable:hover::-webkit-scrollbar-thumb {
  min-height: 5rem;
  max-height: 12.5rem;
  border-radius: 3px;
  background-color: rgba(0, 0, 0, 0.5);
  opacity: 1;
}

.scrollable-y-bordered::before,
.scrollable-y-bordered::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border, #e0e0e0);
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
  z-index: 10;
  pointer-events: none;
}

.scrollable-y-bordered::before {
  top: 0;
}

.scrollable-y-bordered::after {
  bottom: 0;
}

.scrollable-y-bordered:not(.scrolled-start)::before {
  opacity: 1;
}

.scrollable-y-bordered:not(.scrolled-end)::after {
  opacity: 1;
}
</style>
