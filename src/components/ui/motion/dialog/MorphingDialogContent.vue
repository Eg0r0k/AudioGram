<script setup lang="ts">
import {
  HTMLAttributes,
  inject,
  nextTick,
  onUnmounted,
  ref,
  watch,
} from "vue";

import { motion } from "motion-v";

import { MorphingDialogKey } from "./context";
import { onClickOutside } from "@vueuse/core";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();

const dialog = inject(MorphingDialogKey)!;

const containerRef = ref<HTMLDivElement | null>(null);

function close() {
  dialog.setIsOpen(false);
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
}

// Mounted only while open, so without `immediate` the open branch (Escape
// handler, scroll lock, initial focus) would never run.
watch(dialog.isOpen, async (value) => {
  if (value) {
    document.body.classList.add("overflow-hidden");

    await nextTick();

    const focusable
      = containerRef.value?.querySelectorAll(
        "button, [href], input, textarea, select",
      );

    if (focusable?.length) {
      ;(focusable[0] as HTMLElement).focus();
    }

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );
  }
  else {
    document.body.classList.remove(
      "overflow-hidden",
    );

    dialog.triggerRef.value?.focus();

    document.removeEventListener(
      "keydown",
      handleKeyDown,
    );
  }
}, { immediate: true });

onClickOutside(containerRef, () => {
  if (dialog.isOpen.value) {
    close();
  }
});

onUnmounted(() => {
  // An instant close (presence re-keyed on resize) unmounts without the
  // close branch above; release the scroll lock here as well.
  document.body.classList.remove("overflow-hidden");
  document.removeEventListener(
    "keydown",
    handleKeyDown,
  );
});
</script>

<template>
  <div ref="containerRef">
    <motion.div
      :id="`motion-ui-morphing-dialog-content-${dialog.uniqueId}`"
      :layout-id="`dialog-${dialog.uniqueId}`"
      :class="cn(props.class)"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`motion-ui-morphing-dialog-title-${dialog.uniqueId}`"
      :aria-describedby="`motion-ui-morphing-dialog-description-${dialog.uniqueId}`"
    >
      <slot />
    </motion.div>
  </div>
</template>
