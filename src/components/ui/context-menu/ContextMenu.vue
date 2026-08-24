<script setup lang="ts">
import type { ContextMenuRootEmits, ContextMenuRootProps } from "reka-ui";
import { ContextMenuRoot, useForwardPropsEmits } from "reka-ui";
import { computed, ref } from "vue";
import { useOverlayScrollLock } from "@/components/ui/scrollable/scroll-lock";
import ContextMenuCursorAutoClose from "./ContextMenuCursorAutoClose.vue";
import { registerOverlayBackHandler } from "@/composables/useOverlayBackButton";

const props = defineProps<ContextMenuRootProps>();
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
