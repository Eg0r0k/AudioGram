<template>
  <Teleport to="body">
    <DropdownMenu
      v-model:open="localOpen"
      :modal="false"
    >
      <DropdownMenuTrigger as-child>
        <div
          class="pointer-events-none fixed"
          :style="anchorStyle"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        class="w-65"
        side="left"
        align="start"
      >
        <component
          :is="contextComponent"
          v-if="activeTrack"
          v-bind="contextProps"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, toRef, type Component } from "vue";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import { useTrackContextActions } from "@/modules/tracks/composables/useTrackContextActions";
import {
  dropdownMenuTrackComponents,
  provideTrackMenuComponents,
} from "../useTrackMenuComponents";
import type { TrackContext } from "../type";
import type { PlaylistId, AlbumId } from "@/types/ids";
import DefaultContext from "../contexts/DefaultContext.vue";
import CurrentTrackContext from "../contexts/CurrentTrackContext.vue";
import LikedContext from "../contexts/LikedContext.vue";
import PlaylistContext from "../contexts/PlaylistContext.vue";
import QueueContext from "../contexts/QueueContext.vue";
import HistoryContext from "../contexts/HistoryContext.vue";
import { useQueueStore } from "@/modules/queue/store/queue.store";

provideTrackMenuComponents(dropdownMenuTrackComponents);

interface Props {
  context?: TrackContext;
  isPlaylistOwner?: boolean;
  playlistId?: PlaylistId;
  albumId?: AlbumId;
  onNavigate?: () => void;
}

const props = withDefaults(defineProps<Props>(), {
  context: "default",
  playlistId: undefined,
  albumId: undefined,
  isPlaylistOwner: false,
  onNavigate: undefined,
});

const queueStore = useQueueStore();

const {
  activeTrack,
  activeIndex,
  activeQueueItemId,
  isDropdownOpen,
  activeDropdownTarget,
  dropdownAnchor,
} = useTrackMenu();

const localOpen = computed({
  get: () => isDropdownOpen.value && activeDropdownTarget.value === props.context,
  set: (value: boolean) => {
    if (value) return;
    if (activeDropdownTarget.value !== props.context) return;
    isDropdownOpen.value = false;
  },
});

const anchorStyle = computed(() => ({
  left: `${dropdownAnchor.value.x}px`,
  top: `${dropdownAnchor.value.y}px`,
  width: `${dropdownAnchor.value.width}px`,
  height: `${dropdownAnchor.value.height}px`,
}));

const contexts: Record<TrackContext, Component> = {
  "default": DefaultContext,
  "current-track": CurrentTrackContext,
  "search": DefaultContext,
  "liked": LikedContext,
  "artist": DefaultContext,
  "queue": QueueContext,
  "playlist": PlaylistContext,
  "album": DefaultContext,
  "history": HistoryContext,
};

const contextComponent = computed(() => contexts[props.context]);

const actions = useTrackContextActions(
  activeTrack,
  // toRef(props, "context"),
  {
    playlistId: toRef(props, "playlistId"),
    queueIndex: activeIndex,
    queueItemId: activeQueueItemId,
    onNavigate: props.onNavigate,
  },
);

const contextProps = computed(() => {
  if (!activeTrack.value) return {};

  const base = { track: activeTrack.value, actions };

  if (props.context === "playlist") {
    return { ...base, playlistId: props.playlistId, isOwner: props.isPlaylistOwner };
  }

  if (props.context === "queue") {
    return { ...base, queueIndex: activeIndex.value ?? -1, queueLength: queueStore.size };
  }

  return base;
});
</script>
