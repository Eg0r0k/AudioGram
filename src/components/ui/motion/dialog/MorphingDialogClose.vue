<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { inject } from "vue";

import { motion } from "motion-v";
import type { VariantType } from "motion-v";

import { MorphingDialogKey } from "./context";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

import IconX from "~icons/tabler/x";

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes["class"];
    variants?: {
      initial: VariantType;
      animate: VariantType;
      exit: VariantType;
    };

    size?:
      | "default"
      | "sm"
      | "lg"
      | "icon";
  }>(),
  {
    variant: "ghost",
    size: "icon",
  },
);

const dialog = inject(MorphingDialogKey);

if (!dialog) {
  throw new Error(
    "MorphingDialogClose must be used inside MorphingDialog",
  );
}

const close = () => {
  dialog.setIsOpen(false);
};
</script>

<template>
  <motion.div
    initial="initial"
    animate="animate"
    exit="exit"
    :variants="props.variants"
    class="absolute top-4 right-4 z-50"
  >
    <Button
      variant="ghost"
      size="icon-lg"
      :class="
        cn(
          'rounded-full',
          props.class,
        )
      "
      @click="close"
    >
      <slot>
        <IconX class="size-5" />
      </slot>
    </Button>
  </motion.div>
</template>
