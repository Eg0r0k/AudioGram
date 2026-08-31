<template>
  <MotionConfig :transition="transition">
    <LayoutGroup :id="uniqueId">
      <slot />
    </LayoutGroup>
  </MotionConfig>
</template>

<script lang="ts" setup>

import type {
  Transition } from "motion-v";
import {
  LayoutGroup,
  MotionConfig,
} from "motion-v";
import { useId, ref, provide, computed } from "vue";
import { MorphingDialogKey } from "./context";

const props = defineProps<{
  transition?: Transition;
  id?: string;
}>();

const isOpen = ref(false);
const uniqueId = computed(() => props.id || useId().replace(/:/g, ""));
const triggerRef = ref<HTMLButtonElement | null>(null);

const setIsOpen = (value: boolean) => {
  isOpen.value = value;
};
provide(MorphingDialogKey, {
  isOpen,
  setIsOpen,
  uniqueId: uniqueId.value,
  triggerRef,
});

</script>
