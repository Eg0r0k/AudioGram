<template>
  <div
    ref="containerRef"
    class="relative"
  >
    <Button
      ref="buttonRef"
      size="icon-sm"
      variant="ghost-primary"
      class="rounded-full"
      @click="toggleMute"
      @mouseenter="showTooltip"
      @mouseleave="hideTooltip"
      @focus="showTooltip"
      @blur="hideTooltip"
    >
      <Icon
        class="size-4.5"
        :icon="volumeIcon"
      />
    </Button>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isVisible"
        ref="tooltipRef"
        role="tooltip"
        :class="[
          'absolute p-2 shadow-lg bg-card rounded-md z-50',
          positionClasses
        ]"
      >
        <Slider
          v-if="position === 'top'"
          v-model="volume"
          :max="100"
          :step="1"
          orientation="vertical"
          class="h-16! min-h-0! cursor-pointer"
        />

        <Slider
          v-else
          v-model="volume"
          :max="100"
          :step="1"
          orientation="horizontal"
          class="w-20! min-w-0! cursor-pointer"
        />
      </div>
    </Transition>
  </div>
</template>

<script lang="ts" setup>
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Icon } from "@iconify/vue";
import { unrefElement, useEventListener } from "@vueuse/core";
import { computed, ref, useTemplateRef } from "vue";

const containerRef = useTemplateRef("containerRef");
const buttonRef = useTemplateRef("buttonRef");
const tooltipRef = useTemplateRef("tooltipRef");

const volume = ref([50]);
const lastVolume = ref(50);
const isVisible = ref(false);
const position = ref<"top" | "right">("top");

const MIN_TOP_SPACE = 120;

const volumeIcon = computed(() => {
  const v = volume.value[0];
  if (v === 0) return "tabler:volume-off";
  if (v < 30) return "tabler:volume-2";
  return "tabler:volume";
});

const positionClasses = computed(() => {
  if (position.value === "top") {
    return "bottom-full mb-2 left-1/2 -translate-x-1/2 origin-bottom";
  }
  return "left-full ml-2 top-1/2 -translate-y-1/2 origin-left";
});

const calculatePosition = () => {
  const container = unrefElement(containerRef);
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const spaceAbove = rect.top;

  position.value = spaceAbove >= MIN_TOP_SPACE ? "top" : "right";
};

let hideTimeout: ReturnType<typeof setTimeout> | null = null;

const showTooltip = () => {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  calculatePosition();
  isVisible.value = true;
};

const hideTooltip = () => {
  hideTimeout = setTimeout(() => {
    isVisible.value = false;
  }, 100);
};

const handleScroll = (e: WheelEvent) => {
  e.preventDefault();
  const step = 5;
  const current = volume.value[0];
  const newVolume = e.deltaY > 0
    ? Math.max(0, current - step)
    : Math.min(100, current + step);
  volume.value = [newVolume];
};

const toggleMute = () => {
  if (volume.value[0] > 0) {
    lastVolume.value = volume.value[0];
    volume.value = [0];
  }
  else {
    volume.value = [lastVolume.value > 0 ? lastVolume.value : 50];
  }
};

useEventListener(
  () => unrefElement(buttonRef),
  "wheel",
  handleScroll,
  { passive: false },
);

useEventListener(tooltipRef, "mouseenter", showTooltip);
useEventListener(tooltipRef, "mouseleave", hideTooltip);
useEventListener(tooltipRef, "wheel", handleScroll, { passive: false });

useEventListener(window, "scroll", calculatePosition, { passive: true });
useEventListener(window, "resize", calculatePosition, { passive: true });
</script>
