<template>
  <div class="flex flex-col items-center justify-center bg-card h-full text-center gap-3 px-6">
    <div class="size-24 flex items-center justify-center">
      <IconHistory class="size-24 text-muted-foreground" />
    </div>
    <span class="text-muted-foreground font-medium text-">
      {{ t("queue.historyEmpty") }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import IconHistory from "~icons/tabler/history";

const { t } = useI18n();
</script>
