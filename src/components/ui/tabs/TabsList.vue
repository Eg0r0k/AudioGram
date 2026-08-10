<script setup lang="ts">
import type { TabsListProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { nextTick, watch } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { TabsIndicator, TabsList, injectTabsRootContext, useForwardProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<
  TabsListProps & {
    class?: HTMLAttributes["class"];
  }
>();

const delegatedProps = reactiveOmit(props, "class");
const forwardedProps = useForwardProps(delegatedProps);

const rootContext = injectTabsRootContext();

const scrollActiveTabIntoView = (activeTab: HTMLElement) => {
  const scrollContainer = activeTab.closest<HTMLElement>(".scrollable-x");
  if (!scrollContainer) return;

  const containerRect = scrollContainer.getBoundingClientRect();
  const tabRect = activeTab.getBoundingClientRect();

  const tabLeft = tabRect.left - containerRect.left + scrollContainer.scrollLeft;
  const tabRight = tabLeft + activeTab.offsetWidth;

  const padding = 70;

  if (tabLeft - padding < scrollContainer.scrollLeft) {
    scrollContainer.scrollTo({ left: Math.max(0, tabLeft - padding), behavior: "smooth" });
  }
  else if (tabRight + padding > scrollContainer.scrollLeft + scrollContainer.clientWidth) {
    scrollContainer.scrollTo({ left: tabRight + padding - scrollContainer.clientWidth, behavior: "smooth" });
  }
};

watch(() => rootContext.modelValue.value, async () => {
  await nextTick();
  const activeTab = rootContext.tabsList.value?.querySelector<HTMLElement>(
    "[role=\"tab\"][data-state=\"active\"]",
  );
  if (activeTab) scrollActiveTabIntoView(activeTab);
}, { immediate: true });
</script>

<template>
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

    <TabsIndicator
      class="absolute bottom-0 left-0 flex w-(--reka-tabs-indicator-size) translate-x-(--reka-tabs-indicator-position) justify-center transition-[translate,width] duration-300 ease-out motion-reduce:transition-none"
    >
      <span class="h-0.5 w-[65%] rounded-full bg-primary" />
    </TabsIndicator>
  </TabsList>
</template>
