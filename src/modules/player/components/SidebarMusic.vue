<template>
  <div class="min-w-[180px] w-[30%] h-14 pl-1">
    <div
      v-if="track"
      class="flex justify-start items-center relative select-none"
    >
      <div class="relative shrink-0 group size-14 rounded overflow-hidden">
        <NuxtImage
          v-slot="{ imgAttrs, isLoaded, src }"
          :src="coverUrl"
          fallback-src="/img/fallback.svg"
          :alt="track.title ?? ''"
          custom
        >
          <img
            :key="src"
            v-bind="imgAttrs"
            :src="src"
            :alt="track.title ?? ''"
            draggable="false"
            class="absolute left-0 top-0 h-full w-full object-cover object-center transition-[transform,opacity] duration-180 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:scale-100 motion-reduce:transition-opacity motion-reduce:duration-150"
            :class="isLoaded ? 'scale-100 opacity-100' : 'scale-[1.02] opacity-0 motion-reduce:scale-100'"
          >
        </NuxtImage>

        <FullscreenTrigger class="absolute rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div class="grid gap-1 flex-1 min-w-0 max-w-fit overflow-hidden mx-2">
        <MarqueeBlock
          class="group"
          :duration="10"
          animate-on-overflow-only
          pause-on-hover
          gradient
          gradient-color="var(--card)"
          gradient-length="20px"
        >
          <span
            v-copy="track.title"
            class="text-sm group-hover:underline font-medium cursor-pointer"
          >{{ track.title }}</span>
        </MarqueeBlock>
        <MarqueeBlock
          v-if="artistsList.length"
          class="group"
          :duration="6"
          animate-on-overflow-only
          pause-on-hover
          gradient
          gradient-color="var(--card)"
          gradient-length="20px"
        >
          <span class="text-muted-foreground group-hover:text-foreground text-xs transition-colors duration-200">
            <template
              v-for="(artist, i) in artistsList"
              :key="artist"
            >
              <span
                v-if="canNavigateArtists"
                role="link"
                tabindex="0"
                class="cursor-pointer hover:underline"
                @click.stop="goToArtist(i)"
                @keypress.enter.stop="goToArtist(i)"
              >
                {{ artist }}
              </span>
              <span v-else>{{ artist }}</span>
              <span v-if="i < artistsList.length - 1">, </span>
            </template>
          </span>
        </MarqueeBlock>
      </div>

      <Button
        size="icon-sm"
        class="rounded-full mr-1"
        variant="ghost"
        :aria-label="$t('player.moreOptions')"
        @click.stop="onDotsClick"
      >
        <IconDots class="size-5" />
      </Button>
      <template v-if="libraryTrack">
        <Button
          variant="ghost"
          size="icon-sm"
          class="rounded-full"
          :aria-label="libraryTrack.isLiked ? $t('player.unlike') : $t('player.like')"
          @click.stop="toggleLike"
        >
          <IconLikedFilled
            v-if="libraryTrack.isLiked"
            class="size-5 text-primary"
          />
          <IconLike
            v-else
            class="size-5"
          />
        </Button>
      </template>
    </div>

    <TrackDropdown context="current-track" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import MarqueeBlock from "@/components/ui/marquee/MarqueeBlock.vue";
import IconDots from "~icons/tabler/dots";
import IconLike from "~icons/tabler/heart";
import IconLikedFilled from "~icons/tabler/heart-filled";
import FullscreenTrigger from "@/components/layout/fullscreen/FullscreenTrigger.vue";
import { useCurrentTrackCover } from "@/modules/player/composables/useCurrentTrackCover";
import { useToggleTrackLike } from "@/modules/tracks/composables/useToggleTrackLike";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import { routeLocation } from "@/app/router/route-locations";
import { getLogger } from "@/lib/logger";
import { isEphemeralTrack } from "../types";

const { toggleTrackLike } = useToggleTrackLike();
const { openDropdown } = useTrackMenu();
const route = useRouter();

// Show any playing track — library or ephemeral (e.g. a YouTube stream).
const { track, libraryTrack, coverUrl } = useCurrentTrackCover();

const artistsList = computed(() => {
  const artistStr = libraryTrack.value?.artist
    ?? (isEphemeralTrack(track.value) ? track.value.artist : undefined);
  if (!artistStr) return [];
  return artistStr.split(/,\s*/).map(a => a.trim()).filter(Boolean);
});

// Only library tracks have artist entities to navigate to.
const canNavigateArtists = computed(() => libraryTrack.value !== null);

const goToArtist = (index: number) => {
  const artistId = libraryTrack.value?.artistIds[index];
  if (artistId) {
    route.push(routeLocation.artist(artistId))
      .catch(error => getLogger().error(`[Player] Navigation to the artist page failed: ${String(error)}`));
  }
};

const toggleLike = async () => {
  if (!libraryTrack.value) return;
  await toggleTrackLike(libraryTrack.value);
};

const onDotsClick = (event: MouseEvent) => {
  if (!track.value) return;
  openDropdown(track.value, 0, event, { target: "current-track" });
};
</script>
