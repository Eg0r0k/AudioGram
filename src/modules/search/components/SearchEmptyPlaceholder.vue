<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
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
  <Empty class="p-6 py-8 md:p-6 md:py-8">
    <EmptyHeader>
      <EmptyMedia>
        <slot name="icon">
          <IconSearch class="size-20 text-muted-foreground" />
        </slot>
      </EmptyMedia>
      <EmptyTitle>{{ text ?? t("search.placeholder") }}</EmptyTitle>
    </EmptyHeader>
  </Empty>
</template>
