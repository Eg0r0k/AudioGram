<template>
  <div class="flex items-center justify-between gap-3 mt-6 h-14 landscape-short:mt-0">
    <div class="min-w-0 flex-1">
      <MarqueeBlock
        :duration="10"
        animate-on-overflow-only
        pause-on-hover
        gradient
        gradient-color="transparent"
        gradient-length="20px"
      >
        <span class="text-xl text-white font-semibold leading-tight">{{ currentTrack?.title }}</span>
      </MarqueeBlock>
      <MarqueeBlock
        :duration="6"
        animate-on-overflow-only
        pause-on-hover
        gradient
        gradient-color="transparent"
        gradient-length="20px"
      >
        <span class="text-base text-white/80 capitalize mt-0.5 block">
          <template
            v-for="(artistName, artistIndex) in artistsList"
            :key="`${artistName}-${artistIndex}`"
          >
            <span
              v-if="canNavigateArtists"
              role="link"
              tabindex="0"
              class="inline-block cursor-pointer py-1.5 -my-1.5 active:text-white"
              @click.stop="goToArtistAt(artistIndex)"
              @keypress.enter.stop="goToArtistAt(artistIndex)"
            >{{ artistName }}</span>
            <span v-else>{{ artistName }}</span>
            <span v-if="artistIndex < artistsList.length - 1">, </span>
          </template>
        </span>
      </MarqueeBlock>
    </div>

    <div class="flex items-center gap-1 shrink-0">
      <Button
        v-if="libraryTrack"
        variant="ghost"
        size="icon-lg"
        class="rounded-full text-white"
        :aria-label="libraryTrack.isLiked ? $t('player.unlike') : $t('player.like')"
        @click.stop="toggleLike"
      >
        <IconLikedFilled
          v-if="libraryTrack.isLiked"
          class="size-6 text-primary"
        />
        <IconLike
          v-else
          class="size-6"
        />
      </Button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import MarqueeBlock from "@/components/ui/marquee/MarqueeBlock.vue";
import { Button } from "@/components/ui/button";
import { useCurrentPlayerTrack } from "@/modules/player/composables/useCurrentPlayerTrack";
import { useToggleTrackLike } from "@/modules/tracks/composables/useToggleTrackLike";
import { useTrackContextActions } from "@/modules/tracks/composables/useTrackContextActions";

import IconLike from "~icons/tabler/heart";
import IconLikedFilled from "~icons/tabler/heart-filled";

const emit = defineEmits<{
  close: [];
}>();

const { currentTrack, libraryTrack } = useCurrentPlayerTrack();
const { toggleTrackLike } = useToggleTrackLike();

const toggleLike = async () => {
  if (!libraryTrack.value) return;
  await toggleTrackLike(libraryTrack.value);
};

const trackActions = useTrackContextActions(currentTrack, {
  onNavigate: () => emit("close"),
});

const artistsList = computed(() => {
  const artistNames = currentTrack.value?.artist;
  if (!artistNames) return [];
  return artistNames.split(/,\s*/).map(name => name.trim()).filter(Boolean);
});

const canNavigateArtists = computed(() => libraryTrack.value !== null);

const goToArtistAt = (index: number) => {
  const artistId = libraryTrack.value?.artistIds[index];
  if (!artistId) return;
  trackActions.goToArtist(artistId);
};
</script>
