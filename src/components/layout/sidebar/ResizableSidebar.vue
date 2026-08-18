<template>
  <aside
    v-if="sidebar.isOpen"
    class="sidebar-wrapper"
    :class="{ 'is-resizing': isResizing }"
    :style="{ width: `${displayWidth}px` }"
  >
    <div class="sidebar-content">
      <div class="sidebar-header" />

      <nav class="sidebar-nav">
        <slot />
      </nav>
    </div>

    <button
      type="button"
      class="resize-handle"
      aria-label="Resize sidebar"
      @mousedown="startResize"
      @touchstart="startResizeTouch"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed, provide, ref, watch, onUnmounted } from "vue";
import { useEventListener } from "@vueuse/core";
import { animate, useReducedMotion } from "motion-v";
import { useSidebar } from "@/composables/useSidebar";
import { useSearch } from "@/modules/search/composables/useSearch";
import {
  SIDEBAR_COMPACT_KEY,
  SIDEBAR_COMPACT_WIDTH,
  SIDEBAR_EXPANDED_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_SNAP_THRESHOLD,
} from "@/components/layout/sidebar/sidebarCompact";

const { leftSidebar: sidebar, setLeftSidebarWidth } = useSidebar();
const { isSearchOpen } = useSearch();
const prefersReduced = useReducedMotion();

const isCompact = computed(() => sidebar.value.width < SIDEBAR_EXPANDED_MIN_WIDTH);
provide(SIDEBAR_COMPACT_KEY, isCompact);

const isResizing = ref(false);

const displayWidth = ref(sidebar.value.width);
let widthAnimation: ReturnType<typeof animate> | null = null;

watch(() => sidebar.value.width, (target) => {
  widthAnimation?.stop();
  widthAnimation = null;

  if (isResizing.value || prefersReduced.value) {
    displayWidth.value = target;
    return;
  }

  widthAnimation = animate(displayWidth.value, target, {
    duration: 0.3,
    ease: [0.23, 1, 0.32, 1],
    onUpdate: (value) => {
      displayWidth.value = value;
    },
  });
});

let startX = 0;
let startWidth = 0;

const cleanupListeners: Array<() => void> = [];

function startResize(e: MouseEvent) {
  e.preventDefault();
  isResizing.value = true;
  startX = e.clientX;
  startWidth = sidebar.value.width;

  cleanupListeners.push(
    useEventListener(document, "mousemove", handleResize),
    useEventListener(document, "mouseup", stopResize),
  );

  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function startResizeTouch(e: TouchEvent) {
  if (e.touches.length !== 1) return;

  isResizing.value = true;
  startX = e.touches[0].clientX;
  startWidth = sidebar.value.width;

  cleanupListeners.push(
    useEventListener(document, "touchmove", handleResizeTouch, { passive: false }),
    useEventListener(document, "touchend", stopResize),
    useEventListener(document, "touchcancel", stopResize),
  );
}

function handleResize(e: MouseEvent) {
  if (!isResizing.value) return;
  updateWidth(e.clientX);
}

function handleResizeTouch(e: TouchEvent) {
  if (!isResizing.value || e.touches.length !== 1) return;
  if (e.cancelable) e.preventDefault();
  updateWidth(e.touches[0].clientX);
}

function updateWidth(clientX: number) {
  const raw = startWidth + (clientX - startX);

  const newWidth = raw < SIDEBAR_SNAP_THRESHOLD && !isSearchOpen.value
    ? SIDEBAR_COMPACT_WIDTH
    : Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_EXPANDED_MIN_WIDTH, raw));

  setLeftSidebarWidth(newWidth);
}

function stopResize() {
  if (!isResizing.value) return;

  isResizing.value = false;
  cleanupListeners.forEach(cleanup => cleanup());
  cleanupListeners.length = 0;

  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

onUnmounted(() => {
  stopResize();
  widthAnimation?.stop();
});
</script>

<style scoped>
.sidebar-wrapper {
  position: relative;
  flex-shrink: 0;
  height: 100%;
  background: var(--card);
  display: flex;
  transition: none;
  will-change: width;
}

.sidebar-wrapper::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 1px;
  background: var(--border);
  pointer-events: none;
  z-index: 10;
}

:global(.dark) .sidebar-wrapper::after {
  background: var(--background);
}

.sidebar-wrapper.is-resizing {
  user-select: none;
}

.sidebar-content {
  flex: 1;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sidebar-header {
  flex-shrink: 0;
}

.sidebar-nav {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background-color 0.2s;
  touch-action: none;
  z-index: 20;
  border: none;
  padding: 0;
}

.resize-handle:hover,
.resize-handle:active {
  background: var(--primary);
}

.resize-handle::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: 12px;
  left: 50%;
  transform: translateX(-50%);
}
</style>
