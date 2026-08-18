<script setup lang="ts">
import type { DropdownMenuRootEmits, DropdownMenuRootProps } from "reka-ui";
import { DropdownMenuRoot, useForwardPropsEmits } from "reka-ui";
import { computed, ref } from "vue";
import { useOverlayScrollLock } from "@/components/ui/scrollable/scroll-lock";
import DropdownMenuCursorAutoClose from "./DropdownMenuCursorAutoClose.vue";

const props = defineProps<DropdownMenuRootProps>();
const emits = defineEmits<DropdownMenuRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);

const emittedOpen = ref(props.defaultOpen ?? false);
const isOpen = computed(() => props.open ?? emittedOpen.value);
useOverlayScrollLock(isOpen);

const bindings = computed(() => ({
  ...forwarded.value,
  "onUpdate:open": (open: boolean) => {
    emittedOpen.value = open;
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
