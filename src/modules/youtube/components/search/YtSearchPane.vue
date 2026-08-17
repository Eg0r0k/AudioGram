<template>
  <div class="flex flex-col flex-1 min-h-0">
    <Empty
      v-if="!isAvailable"
      class="p-6 py-12 md:p-6 md:py-12"
    >
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          class="rounded-full text-muted-foreground"
        >
          <IconCloudOff class="size-5" />
        </EmptyMedia>
        <EmptyDescription>{{ $t("youtube.unavailable") }}</EmptyDescription>
      </EmptyHeader>
    </Empty>

    <template v-else>
      <YtSearchChips
        :chip="ytChip"
        @update:chip="setYtChip"
      />

      <Scrollable
        v-if="!submittedYtQuery"
        class="flex-1 min-h-0"
      >
        <div class="flex flex-col py-6 gap-4 px-4 pt-0">
          <SearchRecentQueries
            v-if="recentQueries.length"
            :items="recentQueries"
            @apply="applyYtHistoryItem"
            @remove="removeHistoryItem"
            @clear="clearHistory"
          />
          <SearchEmptyPlaceholder :text="$t('search.ytHint')">
            <template #icon>
              <IconBrandYoutube class="size-20 text-muted-foreground" />
            </template>
          </SearchEmptyPlaceholder>
        </div>
      </Scrollable>

      <YtSearchAllSections
        v-else-if="ytChip === 'all'"
        :query="submittedYtQuery"
        @show-all="setYtChip"
      />
      <YtSearchList
        v-else
        :chip="ytChip"
        :query="submittedYtQuery"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { useSearch } from "@/modules/search/composables/useSearch";
import { Scrollable } from "@/components/ui/scrollable";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import IconCloudOff from "~icons/tabler/cloud-off";
import SearchEmptyPlaceholder from "@/modules/search/components/SearchEmptyPlaceholder.vue";
import SearchRecentQueries from "@/modules/search/components/SearchRecentQueries.vue";
import { youtubeProvider } from "../../provider";
import IconBrandYoutube from "~icons/tabler/brand-youtube";
import YtSearchAllSections from "./YtSearchAllSections.vue";
import YtSearchChips from "./YtSearchChips.vue";
import YtSearchList from "./YtSearchList.vue";

const {
  ytChip,
  setYtChip,
  submittedYtQuery,
  recentQueries,
  removeHistoryItem,
  clearHistory,
  applyHistoryItem,
  submitYtSearch,
} = useSearch();

const isAvailable = youtubeProvider.isAvailable;

function applyYtHistoryItem(value: string) {
  applyHistoryItem(value);
  submitYtSearch();
}
</script>
