<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const skeletonVariants = cva(
  "animate-pulse ",
  {
    variants: {
      variant: {
        default: "bg-muted/80 rounded-md",
        primary: "bg-primary/10 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type SkeletonVariants = VariantProps<typeof skeletonVariants>;

interface SkeletonProps {
  class?: HTMLAttributes["class"];
  variant?: SkeletonVariants["variant"];
}

const props = defineProps<SkeletonProps>();
</script>

<template>
  <div
    data-slot="skeleton"
    :class="cn(skeletonVariants({variant}), props.class)"
  />
</template>
