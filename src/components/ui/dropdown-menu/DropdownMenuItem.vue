<script setup lang="ts">
import type { DropdownMenuItemProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { DropdownMenuItem, useForwardProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = withDefaults(defineProps<DropdownMenuItemProps & {
  class?: HTMLAttributes["class"];
  inset?: boolean;
  variant?: "default" | "destructive";
}>(), {
  variant: "default",
});

const delegatedProps = reactiveOmit(props, "inset", "variant", "class");

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <DropdownMenuItem
    v-ripple
    data-slot="dropdown-menu-item"
    :data-inset="inset ? '' : undefined"
    :data-variant="variant"
    v-bind="forwardedProps"
    :class="cn('focus-visible:bg-accent focus-visible:text-accent-foreground press-scale text-foreground font-semibold data-[variant=destructive]:text-destructive data-[variant=destructive]:focus-visible:bg-destructive/10 dark:data-[variant=destructive]:focus-visible:bg-destructive/20 data-[variant=destructive]:focus-visible:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*=\'text-\'])]:text-muted-foreground relative flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4', props.class)"
  >
    <slot />
  </DropdownMenuItem>
</template>
