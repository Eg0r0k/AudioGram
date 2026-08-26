<template>
  <div class="slide-transition-container">
    <Transition :name="transitionName">
      <slot />
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";

const props = defineProps<{
  depth?: number;
  /**
   * Break ties between pages of the same depth (album → artist) by the
   * browser history direction: a push slides in, back/forward slides out.
   * Depth 0 pages are tab roots and never slide between each other.
   */
  historyAware?: boolean;
}>();

const route = useRoute();
const transitionName = ref("");
const hasHash = (fullPath: string) => fullPath.includes("#");

// vue-router stamps its history index onto history.state; the watcher below
// runs after the entry was pushed/popped, so this already reads the new one.
const historyPosition = (): number => {
  const position = typeof history !== "undefined" ? history.state?.position : undefined;
  return typeof position === "number" ? position : 0;
};
let lastPosition = historyPosition();

const resolveByHistory = (): string => {
  const position = historyPosition();
  const delta = position - lastPosition;
  lastPosition = position;
  if (delta > 0) return "slide-left";
  if (delta < 0) return "slide-right";
  return "";
};

watch(
  [() => props.depth, () => route.fullPath],
  ([newDepth, newFullPath], [oldDepth, oldFullPath]) => {
    if (hasHash(newFullPath) || hasHash(oldFullPath)) {
      transitionName.value = "";
      return;
    }

    if (newDepth === undefined || oldDepth === undefined) {
      transitionName.value = "";
      return;
    }

    if (newDepth !== oldDepth) {
      lastPosition = historyPosition();
      transitionName.value = newDepth > oldDepth ? "slide-left" : "slide-right";
      return;
    }

    if (!props.historyAware || newDepth === 0) {
      transitionName.value = "";
      return;
    }

    transitionName.value = resolveByHistory();
  },
);
</script>
<style>
:root {
  --transition-duration: 0.3s;
  --parallax-offset: -20%;
  --overlay-brightness: 0.7;
}

.slide-transition-container {
  display: grid;
  grid-template-columns: 100%;
  grid-template-rows: 100%;
  width: 100%;
  height: 100%;
  overflow: hidden;

  position: relative;
}

.slide-transition-container > * {
  grid-column: 1;
  grid-row: 1;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  backface-visibility: hidden;
  transform: translate3d(0,0,0);
  will-change: transform;
}

.slide-transition-container > * {
   box-shadow: -2px 0 10px rgba(0,0,0,0.1);
}

.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform var(--transition-duration) var(--ease-standard),
              filter var(--transition-duration) var(--ease-standard);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
.slide-left-enter-from {
  transform: translate3d(100%, 0, 0);
  z-index: 50;
}
.slide-left-enter-to {
  transform: translate3d(0, 0, 0);
  z-index: 50;
}

.slide-left-leave-from {
  transform: translate3d(0, 0, 0);
  filter: brightness(1);
  z-index: 1;
}
.slide-left-leave-to {
  transform: translate3d(var(--parallax-offset), 0, 0);
  filter: brightness(var(--overlay-brightness));
  z-index: 1;
}
.slide-right-enter-from {
  transform: translate3d(var(--parallax-offset), 0, 0);
  filter: brightness(var(--overlay-brightness));
  z-index: 1;
}
.slide-right-enter-to {
  transform: translate3d(0, 0, 0);
  filter: brightness(1);
  z-index: 1;
}

.slide-right-leave-from {
  transform: translate3d(0, 0, 0);
  z-index: 50;
}
.slide-right-leave-to {
  transform: translate3d(100%, 0, 0);
  z-index: 50;
}

</style>
