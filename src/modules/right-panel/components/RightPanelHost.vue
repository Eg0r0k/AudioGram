<template>
  <div class="h-full min-h-0 overflow-hidden bg-card">
    <SlideTransition
      :depth="effectiveDepth"
    >
      <component
        :is="activeComponent"
        :key="transitionKey"
        v-bind="activeProps"
        class="h-full"
      />
    </SlideTransition>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useDeviceLayout } from "@/composables/useDeviceLayout";
import SlideTransition from "@/components/transitions/SlideTransition.vue";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { usePlayerStore } from "@/modules/player";
import { isLibraryTrack } from "@/modules/player/types";
import type {
  RightPanelAddTracksPayload,
  RightPanelChaptersPayload,
  RightPanelEditTrackPayload,
  RightPanelEntitySelectPayload,
  RightPanelFolderAddPayload,
  RightPanelTrackInfoPayload,
  RightPanelView,
} from "@/modules/right-panel/types";
import QueuePanel from "./panels/QueuePanel.vue";
import CurrentTrackPanel from "./panels/CurrentTrackPanel.vue";
import LyricsPanel from "./panels/LyricsPanel.vue";
import TrackInfoPanel from "./panels/TrackInfoPanel.vue";
import EditTrackPanel from "./panels/EditTrackPanel.vue";
import AddTracksPanel from "@/modules/tracks/components/tracks-sheet/AddTracksPanel.vue";
import ChaptersPanel from "./panels/ChaptersPanel.vue";
import DownloadsPanel from "./panels/DownloadsPanel.vue";
import EntitySelectView from "./panels/EntitySelectView.vue";
import FolderAddPanel from "./panels/FolderAddPanel.vue";
const { isMobileLayout } = useDeviceLayout();
const rightPanel = useRightPanelStore();
const player = usePlayerStore();

const effectiveView = computed<Exclude<RightPanelView, "none">>(() => {
  if (!rightPanel.isOpen || rightPanel.view === "none") {
    if (isMobileLayout.value) {
      return "queue";
    }

    return "current-track";
  }

  return rightPanel.view;
});

const activeComponent = computed(() => {
  switch (effectiveView.value) {
    case "current-track":
      return CurrentTrackPanel;
    case "lyrics":
      return LyricsPanel;
    case "track-info":
      return TrackInfoPanel;
    case "edit-track":
      return EditTrackPanel;
    case "add-tracks":
      return AddTracksPanel;
    case "queue":
      return QueuePanel;
    case "chapters":
      return ChaptersPanel;
    case "downloads":
      return DownloadsPanel;
    case "entity-select":
      return EntitySelectView;
    case "folder-add":
      return FolderAddPanel;
    default:
      return QueuePanel;
  }
});

const activeProps = computed(() => {
  switch (effectiveView.value) {
    case "current-track":
    case "lyrics":
      return {};
    case "track-info":
      return { payload: rightPanel.payload as RightPanelTrackInfoPayload };
    case "edit-track":
      return { payload: rightPanel.payload as RightPanelEditTrackPayload };
    case "add-tracks":
      return { payload: rightPanel.payload as RightPanelAddTracksPayload };
    case "entity-select":
      return { payload: rightPanel.payload as RightPanelEntitySelectPayload };
    case "folder-add":
      return { payload: rightPanel.payload as RightPanelFolderAddPayload };
    case "queue":
      return {};
    case "chapters": {
      const ct = player.currentTrack;
      if (ct && isLibraryTrack(ct)) {
        return { track: ct };
      }
      return { track: (rightPanel.payload as RightPanelChaptersPayload).track };
    }
    default:
      return {};
  }
});

const effectiveDepth = computed(() => {
  if (isMobileLayout.value) {
    if (!rightPanel.isOpen) return 0;
    return effectiveView.value === "queue" ? 0 : rightPanel.depth;
  }

  switch (effectiveView.value) {
    case "current-track":
      return 0;
    case "queue":
      return 1;
    default:
      return rightPanel.depth + 1;
  }
});

const transitionKey = computed(() => `${effectiveView.value}:${effectiveDepth.value}`);
</script>
