<template>
  <ContextMenu v-model:open="localOpen">
    <ContextMenuCloseBridge :open="localOpen" />
    <div
      ref="guardRef"
      class="contents"
    >
      <ContextMenuTrigger as-child>
        <slot />
      </ContextMenuTrigger>
    </div>

    <ContextMenuContent class="w-65">
      <component
        :is="contextComponent"
        v-if="activeTrack"
        v-bind="contextProps"
      />
    </ContextMenuContent>
  </ContextMenu>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { useEventListener } from "@vueuse/core";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuCloseBridge } from "@/components/ui/context-menu";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import type { AlbumId, PlaylistId } from "@/types/ids";
import { contextMenuTrackComponents, provideTrackMenuComponents } from "../useTrackMenuComponents";
import { TrackContext } from "../type";
import { trackContextComponents } from "../contexts";
import { useTrackContextActions } from "@/modules/tracks/composables/useTrackContextActions";
import { useTrackMenuCaps } from "@/modules/tracks/composables/useTrackMenuCaps";
import { useTrackMenuAutoClose } from "../composables/useTrackMenuAutoClose";
import { useQueueStore } from "@/modules/queue/store/queue.store";

provideTrackMenuComponents(contextMenuTrackComponents);

interface Props {
  context?: TrackContext;
  isPlaylistOwner?: boolean;
  playlistId?: PlaylistId;
  albumId?: AlbumId;
}

const props = withDefaults(defineProps<Props>(), {
  context: "default",
  isPlaylistOwner: false,
  playlistId: undefined,
  albumId: undefined,
});

const {
  activeSubject,
  activeTrack,
  activeIndex,
  activeQueueItemId,
  isContextMenuOpen,
  activeContextMenuTarget,
} = useTrackMenu();
const queueStore = useQueueStore();

const localOpen = computed({
  get: () => isContextMenuOpen.value && activeContextMenuTarget.value === props.context,
  set: (value: boolean) => {
    if (value) return;
    if (activeContextMenuTarget.value !== props.context) return;
    isContextMenuOpen.value = false;
  },
});

useTrackMenuAutoClose(localOpen, {
  context: () => props.context,
  playlistId: () => props.playlistId,
});

const contextComponent = computed(() => trackContextComponents[props.context]);

const actions = useTrackContextActions(activeTrack, {
  playlistId: () => props.playlistId,
  queueIndex: activeIndex,
  queueItemId: activeQueueItemId,
  subject: activeSubject,
});

// Computed once per active subject; contexts receive ready-made booleans.
const caps = useTrackMenuCaps(activeSubject);

const contextProps = computed(() => {
  if (!activeTrack.value) return {};

  const base = {
    track: activeTrack.value,
    actions,
    caps: caps.value,
  };

  switch (props.context) {
    case "playlist":
      return {
        ...base,
        playlistId: props.playlistId,
        isOwner: props.isPlaylistOwner,
      };

    case "queue":
      return {
        ...base,
        queueIndex: activeIndex.value ?? -1,
        queueLength: queueStore.size,
      };

    default:
      return base;
  }
});

const guardRef = useTemplateRef<HTMLElement>("guardRef");

useEventListener(guardRef, "contextmenu", (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (target.closest("[data-media-context]")) {
    return;
  }

  if (!target.closest("[data-track-row], [data-track-menu-trigger]")) {
    e.preventDefault();
    e.stopPropagation();
  }
}, { capture: true });
</script>
