<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>

    <component
      :is="contextComponent"
      v-bind="contextProps"
    />
  </ContextMenu>
</template>

<script setup lang="ts">
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Track } from "@/types/track/track";
import { TrackContext } from "./types";
import { type Component, computed, toRef } from "vue";
import DefaultContext from "./contexts/DefaultContext.vue";
import { useTrackContextActions } from "@/composables/useTrackContextActions";
import QueueContext from "./contexts/QueueContext.vue";
import PlaylistContext from "./contexts/PlaylistContext.vue";
import { PlaylistId } from "@/types/ids";

interface Props {
  track: Track;
  context?: TrackContext;
  isPlaylistOwner?: boolean;
  playlistId?: PlaylistId;
  queueIndex?: number;
}

const props = withDefaults(
  defineProps<Props>(),
  {
    context: "default",
  },
);
const contexts: Record<TrackContext, Component> = {
  "default": DefaultContext,
  "search": DefaultContext,
  "liked": DefaultContext,
  "artist-page": DefaultContext,
  "queue": QueueContext,
  "playlist": PlaylistContext,
  "album": DefaultContext,
  "history": DefaultContext,
};

const contextComponent = computed(() => contexts[props.context]);

const actions = useTrackContextActions(
  toRef(props, "track"),
  toRef(props, "context"),
  {
    playlistId: toRef(props, "playlistId"),
    queueIndex: toRef(props, "queueIndex"),
  },
);

const contextProps = computed(() => {
  const base = {
    track: props.track,
    actions,
  };

  switch (props.context) {
    case "playlist":
      return {
        ...base,
        playlistId: props.playlistId,
        isOwner: props.isPlaylistOwner,
      };
    default:
      return base;
  }
});

</script>
