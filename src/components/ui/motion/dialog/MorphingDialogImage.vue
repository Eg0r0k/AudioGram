<script setup lang="ts">
import { inject } from "vue";
import { motion } from "motion-v";

import { MorphingDialogKey } from "./context";
import { cn } from "@/lib/utils";

const props = defineProps<{
  src: string;
  alt?: string;
  class?: string;
}>();

const dialog = inject(MorphingDialogKey);

if (!dialog) {
  throw new Error(
    "MorphingDialogImage must be used inside MorphingDialog",
  );
}
</script>

<template>
  <motion.img
    :src="props.src"
    :alt="props.alt ?? ''"
    :layout-id="`dialog-img-${dialog.uniqueId}`"
    :class="cn(props.class)"
    draggable="false"
  />
</template>
