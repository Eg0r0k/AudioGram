<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { inject } from "vue";
import { motion } from "motion-v";

import { MorphingDialogKey } from "./context";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();

const dialog = inject(MorphingDialogKey);

if (!dialog) {
  throw new Error(
    "MorphingDialogTitle must be used inside MorphingDialog",
  );
}
</script>

<template>
  <motion.div
    :layout-id="`dialog-title-container-${dialog.uniqueId}`"
    :class="cn(props.class)"
  >
    <slot />
  </motion.div>
</template>
