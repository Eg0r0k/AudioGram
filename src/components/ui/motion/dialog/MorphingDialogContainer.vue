<script setup lang="ts">
import {
  inject,
  onMounted,
  ref, Teleport,
} from "vue";

import {
  AnimatePresence,
  Motion,
} from "motion-v";

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
</script>

<template>
  <Teleport
    v-if="mounted"
    to="body"
  >
    <AnimatePresence
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
