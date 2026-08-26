<script setup lang="ts">
import {
  inject,
  onMounted,
  ref,
} from "vue";

import {
  AnimatePresence,
  Motion,
} from "motion-v";
import { useEventListener } from "@vueuse/core";

import { MorphingDialogKey } from "./context";

const dialog = inject(MorphingDialogKey);

if (!dialog) {
  throw new Error(
    "MorphingDialogContainer must be used inside MorphingDialog",
  );
}

const mounted = ref(false);

onMounted(() => {
  mounted.value = true;
});

// The content shares a layout-id with the trigger, so closing is a layout
// morph back into it. A viewport resize while open (maximizing via the
// titlebar double-click, snapping) leaves motion's projection tree with
// pre-resize measurements: the exit morph then never completes, the
// backdrop fades out on its own, and the content stays as an orphan nothing
// can close. Re-keying the presence drops the whole tree synchronously — no
// exit animation, no orphan. A cover preview is not worth one after a resize.
const presenceKey = ref(0);

useEventListener(window, "resize", () => {
  if (!dialog.isOpen.value) return;
  presenceKey.value++;
  dialog.setIsOpen(false);
});
</script>

<template>
  <Teleport
    v-if="mounted"
    to="body"
  >
    <AnimatePresence
      :key="presenceKey"
      :initial="false"
      mode="sync"
    >
      <template v-if="dialog.isOpen.value">
        <Motion
          :key="`backdrop-${dialog.uniqueId}`"
          class="
            fixed
            z-50
            inset-0
            h-full
            w-full
            bg-white/40
            backdrop-blur-xs
            dark:bg-black/40
          "
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :exit="{ opacity: 0 }"
        />

        <div
          class="
            fixed
            inset-0
            z-70
            flex
            items-center
            justify-center
          "
        >
          <slot />
        </div>
      </template>
    </AnimatePresence>
  </Teleport>
</template>
