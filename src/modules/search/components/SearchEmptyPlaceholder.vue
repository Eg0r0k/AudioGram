<script setup lang="ts">
import { useI18n } from "vue-i18n";
import IconSearch from "~icons/tabler/search";

withDefaults(defineProps<{
  /** Placeholder text; defaults to the library search hint. */
  text?: string;
}>(), {
  text: undefined,
});

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col  items-center justify-center py-8 gap-3 px-6 text-center">
    <div class=" flex items-center justify-center">
      <slot name="icon">
        <IconSearch class="size-20 text-muted-foreground" />
      </slot>
    </div>
    <p class="text-lg font-semibold">
      {{ text ?? t("search.placeholder") }}
    </p>
  </div>
</template>
