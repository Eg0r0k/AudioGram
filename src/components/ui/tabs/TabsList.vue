<script setup lang="ts">
import type { TabsListProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { ref, onMounted, nextTick, onBeforeUnmount } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { TabsList, useForwardProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<
  TabsListProps & {
    class?: HTMLAttributes["class"];
  }
>();

const delegatedProps = reactiveOmit(props, "class");
const forwardedProps = useForwardProps(delegatedProps);

const containerRef = ref<HTMLElement | null>(null);

const indicatorStyle = ref({
  width: "0px",
  left: "0px",
  opacity: 0,
});

const INDICATOR_SCALE = 0.65;

const updateIndicator = () => {
  if (!containerRef.value) return;

  const activeTab = containerRef.value.querySelector<HTMLElement>(
    '[data-state="active"]'
  );

  if (activeTab) {
    const tabWidth = activeTab.offsetWidth;
    const indicatorWidth = tabWidth * INDICATOR_SCALE;
    const offset = (tabWidth - indicatorWidth) / 2;

    indicatorStyle.value = {
      width: `${indicatorWidth}px`,
      left: `${activeTab.offsetLeft + offset}px`,
      opacity: 1,
    };
  }
};

let mutationObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  nextTick(() => {
    if (!containerRef.value) return;

    updateIndicator();

    mutationObserver = new MutationObserver(updateIndicator);
    mutationObserver.observe(containerRef.value, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-state"],
    });

    resizeObserver = new ResizeObserver(updateIndicator);
    resizeObserver.observe(containerRef.value);
  });
});

onBeforeUnmount(() => {
  mutationObserver?.disconnect();
  resizeObserver?.disconnect();
});
</script>

<template>
  <div ref="containerRef" class="relative">
    <TabsList
      data-slot="tabs-list"
      v-bind="forwardedProps"
      :class="
        cn(
          'relative inline-flex h-10 w-fit items-center justify-center gap-1 bg-transparent',
          props.class
        )
      "
    >
      <slot />
    </TabsList>

    <span
      class="absolute bottom-0 h-0.5 bg-primary rounded-full transition-all duration-300 ease-out"
      :style="{
        width: indicatorStyle.width,
        left: indicatorStyle.left,
        opacity: indicatorStyle.opacity,
      }"
    />
  </div>
</template>
