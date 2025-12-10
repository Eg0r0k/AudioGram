<template>
  <div
    ref="containerRef"
    class="marquee-wrapper"
    :class="{ vertical, horizontal: !vertical }"
    :style="cssVariables"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
  >
    <div
      v-if="gradient && isOverflowing"
      class="gradient-overlay"
      :class="{ vertical, horizontal: !vertical }"
      aria-hidden="true"
    />

    <div class="marquee-content">
      <div
        ref="contentRef"
        class="marquee-track"
        :class="trackClasses"
        :style="trackStyle"
      >
        <slot />
      </div>

      <template v-if="isOverflowing">
        <div
          class="marquee-track"
          :class="trackClasses"
          :style="trackStyle"
          aria-hidden="true"
        >
          <slot />
        </div>
        <div
          v-for="i in extraClones"
          :key="i"
          class="marquee-track"
          :class="trackClasses"
          :style="trackStyle"
          aria-hidden="true"
        >
          <slot />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useResizeObserver, useDebounceFn } from "@vueuse/core";

type Direction = "normal" | "reverse";

interface Props {
  vertical?: boolean;
  direction?: Direction;
  duration?: number;
  delay?: number;
  loop?: number;
  animateOnOverflowOnly?: boolean;
  gradient?: boolean;
  gradientColor?: [number, number, number] | string;
  gradientLength?: string;
  pauseOnHover?: boolean;
  pause?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  vertical: false,
  direction: "normal",
  duration: 20,
  delay: 0,
  loop: 0,
  animateOnOverflowOnly: false,
  gradient: false,
  gradientColor: () => [255, 255, 255],
  gradientLength: "200px",
  pauseOnHover: false,
  pause: false,
});

const emit = defineEmits<{
  overflowDetected: [];
  overflowCleared: [];
}>();

const containerRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);

const extraClones = ref(0);
const isOverflowing = ref(false);
const isHovering = ref(false);
const forceReset = ref(false);

const lastContainerSize = ref(0);
const lastContentSize = ref(0);

const trackClasses = computed(() => ({
  animating: isOverflowing.value && !forceReset.value,
  paused: props.pause || (props.pauseOnHover && isHovering.value),
}));

const trackStyle = computed(() => {
  if (forceReset.value) {
    return { transform: "translateX(0)" };
  }
  return {};
});

const gradientColorValue = computed(() => {
  if (typeof props.gradientColor === "string") {
    return `${props.gradientColor}, transparent`;
  }
  const [r, g, b] = props.gradientColor;
  return `rgba(${r}, ${g}, ${b}, 1), rgba(${r}, ${g}, ${b}, 0)`;
});

const cssVariables = computed(() => ({
  "--marquee-duration": `${props.duration}s`,
  "--marquee-delay": `${props.delay}s`,
  "--marquee-direction": props.direction,
  "--marquee-loops": props.loop === 0 ? "infinite" : String(props.loop),
  "--marquee-gradient-color": gradientColorValue.value,
  "--marquee-gradient-length": props.gradientLength,
}));

const getOwnerWindow = (): Window => {
  return containerRef.value?.ownerDocument?.defaultView ?? window;
};

const getOwnerDocument = (): Document => {
  return containerRef.value?.ownerDocument ?? document;
};

const calculateOverflow = () => {
  if (!containerRef.value || !contentRef.value) return;

  const container = props.vertical
    ? containerRef.value.clientHeight
    : containerRef.value.clientWidth;

  const content = props.vertical
    ? contentRef.value.scrollHeight
    : contentRef.value.scrollWidth;

  if (container === 0 || content === 0) return;

  const containerChanged = Math.abs(container - lastContainerSize.value) > 1;
  const contentChanged = Math.abs(content - lastContentSize.value) > 1;

  if (!containerChanged && !contentChanged) return;

  lastContainerSize.value = container;
  lastContentSize.value = content;

  const wasOverflowing = isOverflowing.value;
  const nowOverflowing = content > container + 1;

  if (wasOverflowing && !nowOverflowing) {
    forceReset.value = true;
    queueMicrotask(() => {
      forceReset.value = false;
    });
  }

  isOverflowing.value = nowOverflowing;

  if (nowOverflowing && !wasOverflowing) {
    emit("overflowDetected");
  }
  else if (!nowOverflowing && wasOverflowing) {
    emit("overflowCleared");
  }

  extraClones.value = Math.max(0, Math.ceil(container / content) - 1);
};

const resetAnimation = async () => {
  forceReset.value = true;
  await nextTick();

  setTimeout(() => {
    forceReset.value = false;
  }, 50);
};

const debouncedCalculate = useDebounceFn(() => {
  calculateOverflow();
}, 50);

const onPointerEnter = () => {
  if (props.pauseOnHover) {
    isHovering.value = true;
  }
};

const onPointerLeave = () => {
  if (props.pauseOnHover) {
    isHovering.value = false;
  }
};

let intervalId: ReturnType<typeof setInterval> | null = null;
let cleanupFns: Array<() => void> = [];

const startIntervalCheck = () => {
  if (intervalId) return;

  intervalId = setInterval(() => {
    calculateOverflow();
  }, 400);
};

const stopIntervalCheck = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
};

const handleWindowResize = () => {
  calculateOverflow();
};

const handleVisibilityChange = () => {
  const doc = getOwnerDocument();
  if (doc.visibilityState === "visible") {
    lastContainerSize.value = 0;
    lastContentSize.value = 0;
    nextTick(() => {
      calculateOverflow();
    });
  }
};

const handleWindowFocus = () => {
  lastContainerSize.value = 0;
  lastContentSize.value = 0;
  nextTick(() => {
    calculateOverflow();
  });
};

useResizeObserver(containerRef, () => {
  calculateOverflow();
});

useResizeObserver(contentRef, (entries) => {
  const entry = entries[0];
  if (!entry) return;

  const newSize = props.vertical
    ? entry.contentRect.height
    : entry.contentRect.width;

  if (Math.abs(newSize - lastContentSize.value) > 3) {
    const wasLarger = lastContentSize.value > newSize;

    if (wasLarger) {
      forceReset.value = true;
      nextTick(() => {
        calculateOverflow();
        setTimeout(() => {
          forceReset.value = false;
        }, 50);
      });
    }
    else {
      resetAnimation();
      debouncedCalculate();
    }
  }
});

onMounted(() => {
  nextTick(() => {
    const win = getOwnerWindow();
    const doc = getOwnerDocument();

    if (contentRef.value) {
      lastContentSize.value = props.vertical
        ? contentRef.value.scrollHeight
        : contentRef.value.scrollWidth;
    }

    calculateOverflow();

    win.addEventListener("resize", handleWindowResize);
    doc.addEventListener("visibilitychange", handleVisibilityChange);
    win.addEventListener("focus", handleWindowFocus);

    cleanupFns.push(
      () => win.removeEventListener("resize", handleWindowResize),
      () => doc.removeEventListener("visibilitychange", handleVisibilityChange),
      () => win.removeEventListener("focus", handleWindowFocus),
    );

    startIntervalCheck();
  });
});

onUnmounted(() => {
  stopIntervalCheck();
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];
});

defineExpose({
  recalculate: () => {
    lastContainerSize.value = 0;
    lastContentSize.value = 0;
    calculateOverflow();
  },
  resetAnimation,
  isOverflowing,
});
</script>

<style scoped>
.marquee-wrapper {
  display: flex;
  position: relative;
  overflow: hidden;
}

.marquee-wrapper.horizontal {
  flex-direction: row;
  width: 100%;
}

.marquee-wrapper.vertical {
  flex-direction: column;
  height: 100%;
}

.marquee-content {
  display: flex;
  width: 100%;
}

.marquee-wrapper.horizontal .marquee-content {
  flex-direction: row;
}

.marquee-wrapper.vertical .marquee-content {
  flex-direction: column;
}

.marquee-track {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.marquee-wrapper.horizontal .marquee-track {
  flex-direction: row;
  min-width: 100%;
  padding-right: 3rem;
}

.marquee-wrapper.vertical .marquee-track {
  flex-direction: column;
  min-height: 100%;
  padding-bottom: 3rem;
}

.marquee-track.animating {
  animation: marquee-scroll var(--marquee-duration) linear var(--marquee-delay)
    var(--marquee-loops);
  animation-direction: var(--marquee-direction);
}

.marquee-track.paused {
  animation-play-state: paused;
}

.marquee-wrapper.vertical .marquee-track.animating {
  animation-name: marquee-scroll-vertical;
}

@keyframes marquee-scroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-100%);
  }
}

@keyframes marquee-scroll-vertical {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-100%);
  }
}

.gradient-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.gradient-overlay::before,
.gradient-overlay::after {
  content: "";
  position: absolute;
}

.gradient-overlay.horizontal::before,
.gradient-overlay.horizontal::after {
  top: 0;
  bottom: 0;
  width: var(--marquee-gradient-length);
  background: linear-gradient(to right, var(--marquee-gradient-color));
}

.gradient-overlay.horizontal::before {
  left: 0;
}

.gradient-overlay.horizontal::after {
  right: 0;
  transform: rotate(180deg);
}

.gradient-overlay.vertical::before,
.gradient-overlay.vertical::after {
  left: 0;
  right: 0;
  height: var(--marquee-gradient-length);
  background: linear-gradient(to bottom, var(--marquee-gradient-color));
}

.gradient-overlay.vertical::before {
  top: 0;
}

.gradient-overlay.vertical::after {
  bottom: 0;
  transform: rotate(180deg);
}
</style>
