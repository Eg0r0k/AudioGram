<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import IconSearchOff from "~icons/tabler/search-off";

defineProps<{
  query: string;
}>();

const { t } = useI18n();
</script>

<template>
  <Empty class="p-6 py-16 md:p-6 md:py-16">
    <EmptyHeader>
      <EmptyMedia
        variant="icon"
        class="rounded-full text-muted-foreground"
      >
        <IconSearchOff class="size-5" />
      </EmptyMedia>
      <EmptyTitle class="text-base">
        {{ t("search.noResults.title", { query }) }}
      </EmptyTitle>
      <EmptyDescription>
        {{ t("search.noResults.hint") }}
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
</template>
