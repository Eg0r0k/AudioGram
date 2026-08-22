<script setup lang="ts">
import type { ContextMenuContentEmits, ContextMenuContentProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { computed, useTemplateRef } from "vue";
import { reactiveOmit } from "@vueuse/core";
import {
  ContextMenuContent,
  ContextMenuPortal,
  injectContextMenuRootContext,
  useForwardPropsEmits,
} from "reka-ui";
import { cn } from "@/lib/utils";
import { useMenuScrim } from "@/composables/useMenuScrim";
import { useSwipeControl } from "@/composables/useSwipeControl";
import { useSafeAreaCollisionPadding } from "@/composables/useSafeAreaCollisionPadding";

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<ContextMenuContentProps & { class?: HTMLAttributes["class"] }>();
const emits = defineEmits<ContextMenuContentEmits>();

const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardPropsEmits(delegatedProps, emits);

const safeAreaPadding = useSafeAreaCollisionPadding();
const collisionPadding = computed(() => props.collisionPadding ?? safeAreaPadding.value);

// Reka's modal mode only sets `pointer-events: none` on body, so anything
// with an explicit pointer-events:auto (overlay internals, custom scrollbar
// thumbs…) stays clickable and receives the outside click THROUGH the layers
// above it. The scrim sits in the same portal right below the content: the
// first outside click lands on it, dismisses the menu and nothing else.
const rootContext = injectContextMenuRootContext();
const showScrim = useMenuScrim(() => rootContext.open.value && rootContext.modal.value);

// A touch flick over the scrim produces no click, so nothing would dismiss
// the menu — the swipe just went nowhere. Treat a swipe in ANY direction as
// an outside interaction and close.
const scrimEl = useTemplateRef<HTMLElement>("scrimEl");
const dismiss = () => rootContext.onOpenChange(false);
useSwipeControl(scrimEl, {
  onSwipeLeft: dismiss,
  onSwipeRight: dismiss,
  onSwipeUp: dismiss,
  onSwipeDown: dismiss,
});

// "partial" (the default) pins the menu to the pointer anchor via limitShift,
// which blocks the shift away from the system-bar zone; only "always" lets
// the menu detach and slide fully inside the padded boundary.
const sticky = computed(() =>
  props.sticky ?? (safeAreaPadding.value.bottom > 0 || safeAreaPadding.value.top > 0 ? "always" : "partial"),
);
</script>

<template>
  <ContextMenuPortal>
    <div
      v-if="showScrim"
      ref="scrimEl"
      data-slot="menu-overlay"
      aria-hidden="true"
      class="pointer-events-auto fixed inset-0 z-50"
    />
    <ContextMenuContent
      data-slot="context-menu-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :collision-padding="collisionPadding"
      :sticky="sticky"
      :class="cn(
        'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--reka-context-menu-content-available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md  p-1 shadow-md',
        props.class,
      )"
    >
      <slot />
    </ContextMenuContent>
  </ContextMenuPortal>
</template>
