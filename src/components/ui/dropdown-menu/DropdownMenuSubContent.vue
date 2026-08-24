<script setup lang="ts">
import type { DropdownMenuContentEmits, DropdownMenuContentProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { reactiveOmit } from "@vueuse/core";
import {
  DropdownMenuSubContent,
  DropdownMenuPortal,
  useForwardPropsEmits,
} from "reka-ui";
import { cn } from "@/lib/utils";
import { useSafeAreaCollisionPadding } from "@/composables/useSafeAreaCollisionPadding";

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<DropdownMenuContentProps & { class?: HTMLAttributes["class"] }>(),
  {
    side: "right",
    sideOffset: 4,
  },
);
const emits = defineEmits<DropdownMenuContentEmits>();

const delegatedProps = reactiveOmit(props, "class");
const forwarded = useForwardPropsEmits(delegatedProps, emits);

const safeAreaPadding = useSafeAreaCollisionPadding();
const collisionPadding = computed(() => props.collisionPadding ?? safeAreaPadding.value);

// "partial" (the default) pins the menu to its anchor via limitShift, which
// blocks the shift away from the system-bar zone; only "always" lets the
// menu detach and slide fully inside the padded boundary.
const sticky = computed(() =>
  props.sticky ?? (safeAreaPadding.value.bottom > 0 || safeAreaPadding.value.top > 0 ? "always" : "partial"),
);
</script>

<template>
  <DropdownMenuPortal>
    <DropdownMenuSubContent
      data-slot="dropdown-menu-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :collision-padding="collisionPadding"
      :sticky="sticky"
      :class="cn(
        'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-(--z-menu) min-w-[8rem] origin-(--reka-dropdown-menu-content-transform-origin) overflow-hidden rounded-md p-1 shadow-md duration-100',
        props.class,
      )"
    >
      <div class="overflow-x-hidden overflow-y-auto max-h-[inherit]">
        <slot />
      </div>
    </DropdownMenuSubContent>
  </DropdownMenuPortal>
</template>
