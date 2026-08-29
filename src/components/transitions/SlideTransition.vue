<template>
  <div class="slide-transition-container">
    <Transition
      :name="transitionName"
      @before-enter="onBeforeEnter"
      @enter="onEnter"
      @after-enter="onEnterSettled"
      @enter-cancelled="onEnterSettled"
    >
      <slot />
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { provide, readonly, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { SLIDE_CONTENT_READY_KEY, useSlideContentReady } from "./slideContentReady";

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

type TransitionSources = [depth: number | undefined, fullPath: string];

const resolveTransitionName = (
  [newDepth, newFullPath]: TransitionSources,
  [oldDepth, oldFullPath]: TransitionSources,
): string => {
  if (hasHash(newFullPath) || hasHash(oldFullPath)) return "";
  if (newDepth === undefined || oldDepth === undefined) return "";

  if (newDepth !== oldDepth) {
    lastPosition = historyPosition();
    return newDepth > oldDepth ? "slide-left" : "slide-right";
  }

  if (!props.historyAware || newDepth === 0) return "";
  return resolveByHistory();
};

// Heavy children (see useSlideContentReady) mount only once the enter
// transition is running on the compositor, so their mount cost no longer sits
// between the click and the first frame of motion. A nested SlideTransition
// starts gated by its parent's slide, so a page that contains one (mobile
// IndexPage) still defers the inner list until the outer slide has started.
const outerReady = useSlideContentReady();
const contentReady = ref(outerReady.value);
provide(SLIDE_CONTENT_READY_KEY, readonly(contentReady));

let enterArmed = false;
let enterInFlight = false;
let stopListening: (() => void) | null = null;

const releaseContent = () => {
  stopListening?.();
  stopListening = null;
  contentReady.value = true;
};

if (!outerReady.value) {
  watch(outerReady, releaseContent, { once: true });
}

// Only a page sliding in from off-screen (slide-left) hides its blank frames.
// A page returning from behind (slide-right) is 80% visible from the first
// frame, and a page replacing an interrupted enter (quick back mid-slide)
// takes over from content that is already on screen — both render in full.
const applyTransition = (name: string) => {
  transitionName.value = name;
  enterArmed = false;
  contentReady.value = name !== "slide-left" || enterInFlight;
};

const onBeforeEnter = () => {
  enterArmed = true;
  enterInFlight = true;
};

const onEnter = (el: Element) => {
  const onTransitionStart = (event: Event) => {
    if (event.target === el) releaseContent();
  };
  el.addEventListener("transitionstart", onTransitionStart);
  stopListening = () => el.removeEventListener("transitionstart", onTransitionStart);
};

const onEnterSettled = () => {
  enterInFlight = false;
  releaseContent();
};

const transitionSources = [() => props.depth, () => route.fullPath] as const;

watch(transitionSources, () => {
  if (!enterArmed) releaseContent();
}, { flush: "post" });

watch(transitionSources, (next, prev) => {
  applyTransition(resolveTransitionName(next, prev));
});
</script>
<style>
:root {
  --transition-duration: 0.35s;
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
