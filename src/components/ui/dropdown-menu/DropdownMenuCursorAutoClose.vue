<script setup lang="ts">
import { injectDropdownMenuRootContext } from "reka-ui";
import { useMenuCursorAutoClose } from "@/composables/useMenuCursorAutoClose";

const rootContext = injectDropdownMenuRootContext();

useMenuCursorAutoClose(rootContext.open, () => rootContext.onOpenChange(false), {
  contentSelector: "[data-slot=\"dropdown-menu-content\"]",
});
</script>

<template>
  <slot />
</template>
