<script setup lang="ts">
import { injectContextMenuRootContext } from "reka-ui";
import { useMenuCursorAutoClose } from "@/composables/useMenuCursorAutoClose";

const rootContext = injectContextMenuRootContext();

useMenuCursorAutoClose(rootContext.open, () => rootContext.onOpenChange(false), {
  contentSelector: "[data-slot=\"context-menu-content\"]",
});
</script>

<template>
  <slot />
</template>
