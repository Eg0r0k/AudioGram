<script setup lang="ts">
import type { ContextMenuRootEmits, ContextMenuRootProps } from "reka-ui";
import { ContextMenuRoot, useForwardPropsEmits } from "reka-ui";
import { computed, ref } from "vue";
import { useOverlayScrollLock } from "@/components/ui/scrollable/scroll-lock";
import ContextMenuCursorAutoClose from "./ContextMenuCursorAutoClose.vue";

const props = defineProps<ContextMenuRootProps>();
const emits = defineEmits<ContextMenuRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);

const isOpen = ref(false);
useOverlayScrollLock(isOpen);

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
