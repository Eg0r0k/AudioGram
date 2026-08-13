<template>
  <div
    v-if="items.length"
    class="px-3 pb-2"
  >
    <div class="flex items-center justify-between px-1 mb-1">
      <p class="text-sm font-medium text-muted-foreground">
        {{ title }}
      </p>
      <Button
        variant="ghost-primary"
        size="sm"
        class="rounded-full text-xs"
        @click="emit('showAll')"
      >
        {{ $t("search.showAll") }}
      </Button>
    </div>
    <SearchDropdownRow
      v-for="item in items"
      :key="item.id"
      :item="ytEntityResultItem(item, t)"
      :to="ytEntityRoute(item) ?? undefined"
    />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import SearchDropdownRow from "@/modules/search/components/SearchDropdownRow.vue";
import type { YtMusicEntity } from "../../types";
import { ytEntityResultItem, ytEntityRoute } from "../../lib/searchRows";

defineProps<{
  title: string;
  items: YtMusicEntity[];
}>();

const emit = defineEmits<{
  showAll: [];
}>();

const { t } = useI18n();
</script>
