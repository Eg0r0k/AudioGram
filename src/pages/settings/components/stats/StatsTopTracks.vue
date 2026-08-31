<template>
  <SettingsGroup class="mt-3">
    <div class="px-4 py-3 text-primary font-medium">
      {{ $t("settings.stats.topTracks") }}
    </div>

    <div
      v-if="isLoading"
      class="mx-2 mb-2 h-40 animate-pulse rounded-lg bg-background"
    />
    <p
      v-else-if="topTracks.length === 0"
      class="px-4 pb-4 text-sm text-muted-foreground"
    >
      {{ $t("settings.stats.emptyPeriod") }}
    </p>

    <template v-else>
      <TrackContextMenu>
        <div class="track-list-grid px-2 pb-2">
          <TrackExpanded
            v-for="(entry, index) in topTracks"
            :key="entry.id"
            :track="entry.track"
            :index="index + 1"
            @play="handlePlayTrack(index)"
            @contextmenu="handleContextMenu(entry.track, index)"
          />
        </div>
      </TrackContextMenu>

      <TrackDropdown />
    </template>
  </SettingsGroup>
</template>

<script setup lang="ts">
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import TrackExpanded from "@/modules/tracks/components/TrackExpanded.vue";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import { useTopTracks } from "@/composables/useStatsQueries";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import { usePlayerStore } from "@/modules/player";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import type { Track } from "@/modules/player/types";

const props = defineProps<{ since?: number }>();

const TOP_LIMIT = 5;

const { topTracks, isLoading } = useTopTracks(TOP_LIMIT, () => props.since);

const playerStore = usePlayerStore();
const queueStore = useQueueStore();
const { openMenu } = useTrackMenu();

async function handlePlayTrack(index: number) {
  const tracks = topTracks.value.map(entry => entry.track);
  const selectedTrack = tracks[index] as Track | undefined;
  if (!selectedTrack) return;

  if (playerStore.currentTrack?.id === selectedTrack.id) {
    await playerStore.togglePlay();
    return;
  }

  await queueStore.setQueue(tracks, index, { type: "manual" });
}

function handleContextMenu(track: Track, index: number) {
  openMenu(track, index);
}
</script>
