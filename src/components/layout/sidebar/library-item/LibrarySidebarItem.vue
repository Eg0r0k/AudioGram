<script setup lang="ts">
import { useRouter } from "vue-router";
import type { LibraryItem } from "@/modules/library/types";
import { Item } from "@/components/ui/item";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Link from "@/components/ui/link/Link.vue";
import { canOpenLibraryMenu, useLibraryMenu } from "@/modules/library/composables/useLibraryMenu";
import LibraryItemCover from "./LibraryItemCover.vue";
import LibraryItemInfo from "./LibraryItemInfo.vue";
import { useLibraryItemView } from "./useLibraryItemView";

const props = defineProps<{
  item: LibraryItem;
  compact?: boolean;
}>();

const emit = defineEmits<{
  openFolder: [folderId: string];
}>();

const { openMenu } = useLibraryMenu();
const router = useRouter();

const { subtitle, coverOwnerType, coverOwnerId, isCurrentPlaybackSource }
  = useLibraryItemView(() => props.item);

const handleClick = () => {
  if (props.item.type === "folder") {
    emit("openFolder", props.item.id);
    return;
  }

  router.push(props.item.to);
};
</script>

<template>
  <TooltipProvider
    :delay-duration="150"
    disable-hoverable-content
  >
    <Tooltip>
      <TooltipTrigger as-child>
        <div
          v-ripple
          class="block rounded-sm focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none focus-visible:border-ring cursor-pointer"
          data-library-item
          :data-library-menu="canOpenLibraryMenu(item) ? undefined : 'none'"
          role="button"
          :class="compact ? '' : 'mx-2'"
          tabindex="0"
          @click="handleClick"
          @keydown.enter="handleClick"
          @contextmenu="openMenu(item)"
        >
          <Link
            v-slot="{ isExactActive }"
            :to="item.to"
            inactive
          >
            <Item
              class="min-w-0 py-2 transition-colors pointer-events-none"
              :class="[
                isExactActive && item.type !== 'folder'
                  ? 'bg-primary text-primary-foreground hover:bg-primary/95'
                  : 'hover:bg-accent/60',
                compact ? 'justify-center gap-0 px-2' : 'gap-3 px-3',
              ]"
            >
              <LibraryItemCover
                :item="item"
                :cover-owner-type="coverOwnerType"
                :cover-owner-id="coverOwnerId"
                :compact="compact"
                :active="isExactActive && item.type !== 'folder'"
                :is-playback-source="isCurrentPlaybackSource"
              />

              <LibraryItemInfo
                v-if="!compact"
                :item="item"
                :subtitle="subtitle"
                :active="isExactActive && item.type !== 'folder'"
                :is-playback-source="isCurrentPlaybackSource"
              />
            </Item>
          </Link>
        </div>
      </TooltipTrigger>

      <TooltipContent
        v-if="compact"
        side="right"
        :side-offset="10"
      >
        <p class="font-medium">
          {{ item.title }}
        </p>
        <p class="text-muted-foreground">
          {{ subtitle }}
        </p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
