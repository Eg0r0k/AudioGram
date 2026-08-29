<script setup lang="ts">
import type { ContextMenuRootEmits, ContextMenuRootProps } from "reka-ui";
import { ContextMenuRoot, useForwardPropsEmits } from "reka-ui";
import { computed, ref } from "vue";
import { useOverlayScrollLock } from "@/components/ui/scrollable/scroll-lock";
import ContextMenuCursorAutoClose from "./ContextMenuCursorAutoClose.vue";
import { registerOverlayBackHandler } from "@/composables/useOverlayBackButton";

// Reka's trigger arms its own long-press timer on every touch pointerdown and
// opens the menu from it, bypassing the native `contextmenu` event. Every menu
// here picks its subject from that native event (Android WebView fires it at
// the system long-press delay), so the synthetic path can only misfire: an
// empty or stale-subject menu when the system delay is longer than reka's,
// and a second menu from an outer root when triggers nest — stopPropagation
// on `contextmenu` clears only the inner trigger's timer. setTimeout's
// maximum delay disables it without patching the library.
const NATIVE_LONG_PRESS_ONLY_MS = 2 ** 31 - 1;

const props = withDefaults(defineProps<ContextMenuRootProps>(), {
  pressOpenDelay: NATIVE_LONG_PRESS_ONLY_MS,
});
const emits = defineEmits<ContextMenuRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);

const isOpen = ref(false);
useOverlayScrollLock(isOpen);
// Android's hardware back must dismiss an open menu, and only surfaces that
// register here are offered the press. Closing goes through reka's own Escape
// path rather than flipping local state: the root is uncontrolled unless the
// consumer passes `open`, and reusing the library's dismissal keeps focus
// restoration and the exit animation identical to a normal close.
registerOverlayBackHandler({
  depth: () => (isOpen.value ? 1 : 0),
  back: () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  },
});

const bindings = computed(() => ({
  ...forwarded.value,
  "onUpdate:open": (open: boolean) => {
    isOpen.value = open;
    emits("update:open", open);
  },
}));
</script>

<template>
  <ContextMenuRoot
    data-slot="context-menu"
    v-bind="bindings"
  >
    <ContextMenuCursorAutoClose />
    <slot />
  </ContextMenuRoot>
</template>
