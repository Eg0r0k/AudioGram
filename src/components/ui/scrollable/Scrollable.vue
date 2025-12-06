<template>
  <div :class="wrapperClasses">
    <div
      v-if="scrollable.USE_OWN_SCROLL && showThumbVisible"
      class="scrollable-thumb-container"
      :class="
        direction === 'horizontal'
          ? 'scrollable-thumb-container-x'
          : 'scrollable-thumb-container-y'
      "
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
      @scroll="handleScrollEmit"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, provide, useTemplateRef } from "vue";
import useScrollable from "./useScrollable";

interface Props {
  direction?: "vertical" | "horizontal";
  onScrollOffset?: number;
  bordered?: boolean;
  hideThumb?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  direction: "vertical",
  onScrollOffset: 300,
  bordered: false,
  hideThumb: false,
});

const emit = defineEmits<{
  scroll: [event: Event];
  scrolledTop: [];
  scrolledBottom: [];
}>();

const containerRef = useTemplateRef("containerRef");

const scrollable = useScrollable(containerRef, {
  direction: props.direction,
  onScrollOffset: props.onScrollOffset,
  onScrolledTop: () => emit("scrolledTop"),
  onScrolledBottom: () => emit("scrolledBottom"),
});

function handleScrollEmit(e: Event) {
  emit("scroll", e);
  scrollable.updateThumb();
}

const wrapperClasses = computed(() => [
  "scrollable-wrapper",
  props.direction === "vertical"
    ? "scrollable-direction-y"
    : "scrollable-direction-x",
  {
    "scrollable-y-bordered": props.bordered && props.direction === "vertical",
    "scrolled-start": props.bordered && scrollable.isScrolledToStart.value,
    "scrolled-end": props.bordered && scrollable.isScrolledToEnd.value,
  },
]);

const containerClasses = computed(() => [
  "scrollable",
  props.direction === "vertical" ? "scrollable-y" : "scrollable-x",
  {
    "no-scrollbar": scrollable.USE_OWN_SCROLL,
    "no-scrollbar-safari": scrollable.IS_SAFARI && !scrollable.IS_MOBILE_SAFARI,
  },
]);

const showThumbVisible = computed(
  () => !props.hideThumb && scrollable.thumbSize.value > 0
);

const thumbStyle = computed(() => {
  if (props.direction === "vertical") {
    return {
      height: `${scrollable.thumbSize.value}px`,
      transform: `translateY(${scrollable.thumbPosition.value}px)`,
    };
  }
  return {
    width: `${scrollable.thumbSize.value}px`,
    transform: `translateX(${scrollable.thumbPosition.value}px)`,
  };
});

provide("scrollable", scrollable);

defineExpose({
  scrollTo: scrollable.scrollTo,
  scrollToEnd: scrollable.scrollToEnd,
  scrollToStart: scrollable.scrollToStart,
  scrollPosition: scrollable.scrollPosition,
  isScrolledToEnd: scrollable.isScrolledToEnd,
  isScrolledToStart: scrollable.isScrolledToStart,
  container: containerRef,
  USE_OWN_SCROLL: scrollable.USE_OWN_SCROLL,
});
</script>

<style>
:root {
  --z-thumb: 100;
}

html.is-firefox .scrollable-y {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0) rgba(0, 0, 0, 0);
}

html.overlay-scroll .scrollable-y:hover {
  scrollbar-color: var(--scrollbar-color) transparent;
}

.scrollable-wrapper {
  position: relative;
  overflow: hidden;
  width: 100%;
}

.scrollable-direction-y {
  height: 100%;
}
.scrollable-direction-x {
  height: auto;
}
.scrollable {
  height: 100%;
  width: 100%;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

.scrollable::-webkit-scrollbar {
  width: 0;
  height: 0;
  opacity: 0;
  width: 0.375rem;
}

.scrollable::-webkit-scrollbar-thumb {
  width: 0;
  height: 0;
  opacity: 0;
  transition: 0.2s ease-in-out;
}

.scrollable::-webkit-scrollbar-thumb {
  opacity: 0;
  transition: 0.2s ease-in-out;
}

.scrollable::-webkit-scrollbar-button {
  width: 0;
  height: 0;
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
}

.scrollable-x {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
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
  position: absolute;
  z-index: var(--z-thumb);
  pointer-events: none;
}

.scrollable-thumb-container-y {
  top: 0;
  right: 2px;
  bottom: 0;
  width: 6px;
}

.scrollable-thumb-container-x {
  left: 0;
  right: 0;
  bottom: 2px;
  height: 6px;
}

.scrollable-thumb {
  position: absolute;
  background: var(--color-muted-foreground);
  border-radius: 3px;
  pointer-events: auto;
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s;
  opacity: 0;
}

.scrollable-thumb-container-y .scrollable-thumb {
  top: 0;
  right: 0;
  width: 6px;
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
  transition: opacity 0.2s;
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
