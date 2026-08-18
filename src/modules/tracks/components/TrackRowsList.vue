<template>
  <div class="flex flex-col">
    <TrackContextMenu :context="menuTarget">
      <div
        class="flex flex-col"
        data-track-menu-scope
      >
        <TrackRow
          v-for="(track, index) in tracks"
          :key="track.id"
          :track="track"
          :menu-target="menuTarget"
          :hide-index="true"
          :compact="compact"
          :hide-cover="hideCover"
          @play="emit('play', track, index)"
        />
      </div>
    </TrackContextMenu>

    <TrackDropdown :context="menuTarget" />
  </div>
</template>

<script setup lang="ts">
import type { Track } from "@/modules/player/types";
import type { TrackContext } from "@/modules/tracks/components/menu/type";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import TrackRow from "@/modules/tracks/components/TrackRow.vue";

withDefaults(defineProps<{
  tracks: Track[];
  menuTarget?: TrackContext;
  compact?: boolean;
  hideCover?: boolean;
  showIndex?: boolean;
}>(), {
  menuTarget: "default",
  compact: false,
  hideCover: false,
  showIndex: false,
});

const emit = defineEmits<{
  play: [track: Track, index: number];
}>();
</script>
