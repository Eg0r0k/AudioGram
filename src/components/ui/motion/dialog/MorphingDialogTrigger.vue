<template>
  <motion.button
    :ref="setTriggerRef"
    type="button"
    :layout-id="`dialog-${dialog.uniqueId}`"
    :class="cn('relative cursor-pointer', props.class)"
    aria-haspopup="dialog"
    :aria-expanded="dialog.isOpen.value"
    :aria-controls="`motion-ui-morphing-dialog-content-${dialog.uniqueId}`"
    @click="toggle"
    @keydown="onKeyDown"
  >
    <slot />
  </motion.button>
</template>
<script lang="ts" setup>
import type { ComponentPublicInstance, HTMLAttributes } from "vue";
import { inject } from "vue";
import { motion } from "motion-v";
import { MorphingDialogKey } from "./context";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();

const dialog = inject(MorphingDialogKey)!;

function setTriggerRef(element: Element | ComponentPublicInstance | null) {
  const resolvedElement = element && "$el" in element ? element.$el : element;
  dialog.triggerRef.value = resolvedElement instanceof HTMLButtonElement ? resolvedElement : null;
}

const toggle = () => {
  dialog.setIsOpen(!dialog.isOpen.value);
};

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggle();
  }
};

</script>
