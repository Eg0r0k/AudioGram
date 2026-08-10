<script setup lang="ts">
import { watch } from "vue";
import { injectContextMenuRootContext } from "reka-ui";

const props = defineProps<{ open: boolean }>();

const rootContext = injectContextMenuRootContext();

watch(() => props.open, (open) => {
  if (!open && rootContext.open.value) {
    rootContext.onOpenChange(false);
  }
});
</script>

<template>
  <slot />
</template>
