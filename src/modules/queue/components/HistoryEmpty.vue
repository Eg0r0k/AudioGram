<template>
  <Empty class="h-full bg-card">
    <EmptyHeader>
      <EmptyMedia>
        <IconHistory class="size-24 text-muted-foreground" />
      </EmptyMedia>
      <EmptyTitle class="text-base text-muted-foreground">
        {{ t("queue.historyEmpty") }}
      </EmptyTitle>
    </EmptyHeader>
  </Empty>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import IconHistory from "~icons/tabler/history";

const { t } = useI18n();
</script>
