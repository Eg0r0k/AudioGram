<script setup lang="ts">
import type { DropdownMenuRootEmits, DropdownMenuRootProps } from "reka-ui";
import { DropdownMenuRoot, useForwardPropsEmits } from "reka-ui";
import { computed, ref } from "vue";
import { useOverlayScrollLock } from "@/components/ui/scrollable/scroll-lock";
import DropdownMenuCursorAutoClose from "./DropdownMenuCursorAutoClose.vue";
import { registerOverlayBackHandler } from "@/composables/useOverlayBackButton";

const props = defineProps<DropdownMenuRootProps>();
const emits = defineEmits<DropdownMenuRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);

// Tracked purely from what the root emits, which it does in both controlled
// and uncontrolled mode. Reading `props.open` first looks equivalent but is
// not: Vue casts an absent boolean prop to `false` rather than `undefined`, so
// `props.open ?? emitted` pinned an uncontrolled menu to "closed" forever —
// the scroll lock never engaged and nothing could tell the menu was open.
const isOpen = ref(props.defaultOpen);
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
  <DropdownMenuRoot
    v-slot="slotProps"
    data-slot="dropdown-menu"
    v-bind="bindings"
  >
    <DropdownMenuCursorAutoClose />
    <slot v-bind="slotProps" />
  </DropdownMenuRoot>
</template>
