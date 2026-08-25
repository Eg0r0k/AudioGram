<template>
  <Scrollable
    ref="scrollableRef"
    direction="horizontal"
    hide-thumb
    :class="cn(
      'w-full',
      dragScroll.isDragging.value && 'cursor-grabbing [&_*]:cursor-grabbing!',
      props.class,
    )"
    @pointerdown="dragScroll.onPointerDown"
    @click.capture="dragScroll.onClickCapture"
    @dragstart="dragScroll.onDragStart"
  >
    <div :class="cn('flex w-max items-stretch gap-2 py-2', props.contentClass)">
      <slot />
    </div>
  </Scrollable>
</template>

<script setup lang="ts">
import { computed, useTemplateRef, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import Scrollable from "./Scrollable.vue";
import useDragScroll from "./useDragScroll";

const props = defineProps<{
  class?: HTMLAttributes["class"];
  contentClass?: HTMLAttributes["class"];
}>();

const scrollableRef = useTemplateRef<InstanceType<typeof Scrollable>>("scrollableRef");
const containerRef = computed(() => scrollableRef.value?.container ?? null);

const dragScroll = useDragScroll(containerRef);
</script>
