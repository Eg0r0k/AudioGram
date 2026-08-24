<script setup lang="ts">
import type { ContextMenuTriggerProps } from "reka-ui";
import { ContextMenuTrigger, useForwardProps } from "reka-ui";

const props = defineProps<ContextMenuTriggerProps>();

const forwardedProps = useForwardProps(props);

// Triggers nest: the artist page wraps its whole scroller in a track menu and
// puts an album menu inside it. Without the `.stop` below the event reaches
// both and two menus open at once, the second belonging to a row nowhere near
// the press. stopPropagation does not affect listeners on this same element,
// so the nearest trigger still opens normally.
</script>

<template>
  <ContextMenuTrigger
    data-slot="context-menu-trigger"
    v-bind="forwardedProps"
    @contextmenu.stop
  >
    <slot />
  </ContextMenuTrigger>
</template>
