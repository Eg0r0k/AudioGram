<template>
  <div class="flex items-center justify-between px-4 pt-2 h-14 shrink-0">
    <Button
      variant="ghost"
      size="icon-lg"
      class="text-white rounded-full"
      :aria-label="$t('common.close')"
      @click="closePlayer"
    >
      <IconChevronDown class="size-6" />
    </Button>

    <div class="flex min-w-0 flex-col items-center">
      <Link
        v-if="sourceLink"
        :to="sourceLink.to"
        class="max-w-55 truncate text-sm font-medium text-white hover:underline"
        @click="closePlayer"
      >
        {{ sourceLink.label }}
      </Link>
      <div
        v-else
        class="text-sm font-medium text-white"
      >
        {{ $t('player.nowPlaying') }}
      </div>

      <Button
        v-if="currentChapter"
        variant="ghost"
        class="mt-0.5 flex h-6 max-w-55 items-center gap-1 rounded-full px-2 text-white/80 hover:bg-white/10 hover:text-white"
        :aria-label="$t('player.chapters')"
        @click.stop="openChapters"
      >
        <IconBookmarks class="size-3.5 shrink-0" />
        <span class="truncate text-xs font-medium">
          {{ currentChapter.title || $t("chapters.untitled") }}
        </span>
      </Button>
    </div>

    <Button
      variant="ghost"
      size="icon-lg"
      class="rounded-full text-white"
      @click.stop="onDotsClick"
    >
      <IconDots class="size-6" />
    </Button>
  </div>

  <TrackDropdown
    context="current-track"
    :on-navigate="closePlayer"
  />
</template>
<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import { useCurrentTrackChapters } from "@/modules/tracks/composables/useCurrentTrackChapters";
import { useCurrentPlayerTrack } from "@/modules/player/composables/useCurrentPlayerTrack";
import { useCurrentTrackPanels } from "@/modules/right-panel/composables/useCurrentTrackPanels";
import { useQueueSourceLink } from "@/modules/queue/composables/useQueueSourceLink";

import IconChevronDown from "~icons/tabler/chevron-down";
import IconBookmarks from "~icons/tabler/bookmarks";
import IconDots from "~icons/tabler/dots";

const emit = defineEmits<{
  close: [];
}>();

const { currentTrack } = useCurrentPlayerTrack();
const { currentChapter } = useCurrentTrackChapters();
const { openChapters } = useCurrentTrackPanels();
const { link: sourceLink } = useQueueSourceLink();
const { openDropdown } = useTrackMenu();

const closePlayer = () => {
  emit("close");
};

const onDotsClick = (event: MouseEvent) => {
  if (!currentTrack.value) return;
  openDropdown(currentTrack.value, 0, event, { target: "current-track" });
};
</script>
