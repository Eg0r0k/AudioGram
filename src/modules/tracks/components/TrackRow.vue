<template>
  <div
    ref="rowRef"
    v-ripple
    role="button"
    tabindex="0"
    data-track-row
    :data-compact="compact"
    :class="[
      styles.root,
      rowStateClass, dimmed && 'opacity-50',
      beingDragged && 'opacity-30',
    ]"
    @click="handleClick"
    @keypress="handleClick"
    @contextmenu="onContextMenu"
  >
    <button
      v-if="draggable"
      class="shrink-0 w-4 h-full cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none flex items-center justify-center"
      :aria-label="$t('queue.drag')"
      @pointerdown.stop="$emit('dragStart', $event)"
      @click.stop
    >
      <IconGripVertical class="size-4.5" />
    </button>

    <span
      v-else-if="!hideIndex"
      :class="styles.index"
    >
      {{ index }}
    </span>

    <div
      v-if="!hideCover"
      class="relative shrink-0  size-10 group-data-[compact=true]:hidden z-10"
    >
      <NuxtImage
        :src="coverUrl"
        :alt="track.title"
        fallback-src="/img/fallback.svg"
        :class="styles.image"
      />

      <div
        :class="[
          styles.imageOverlay,
          showOverlay ? 'opacity-100' : 'opacity-0',
        ]"
      >
        <IconLoader
          v-if="isTrackLoading"
          class="size-4 animate-spin text-white drop-shadow-md"
        />

        <span
          v-else-if="isCurrentTrack && isPlaying && !isRowHovered"
          class="playing-pulse-dot"
        >
          <span />
          <span />
          <span />
        </span>

        <IconPause
          v-else-if="isCurrentTrack && isPlaying && isRowHovered"
          class="size-4 text-white drop-shadow-md"
        />

        <IconPlay
          v-else
          class="size-4 text-white drop-shadow-md"
        />
      </div>
    </div>

    <div :class="styles.info">
      <div
        :class="[styles.title, (highlighted || isCurrentTrack) && 'text-primary']"
      >
        {{ track.title }}
      </div>
      <div :class="styles.artist">
        <template
          v-for="(artist, i) in artists"
          :key="artist"
        >
          <span
            role="link"
            tabindex="0"
            class="hover:text-foreground underline-offset-2 transition-colors duration-200 cursor-pointer truncate"
            @click.stop="handleArtistClick(i)"
            @keypress.enter.stop="handleArtistClick(i)"
          >
            {{ artist }}
          </span>
          <span v-if="i < artists.length - 1">,&nbsp;</span>
        </template>
      </div>
    </div>

    <Button
      v-if="isLibraryRow"
      variant="ghost"
      size="icon-sm"
      :class="[
        'rounded-full transition-opacity',
        isLiked
          ? 'opacity-100 text-primary hover:text-primary'
          : 'opacity-0 text-muted-foreground sm:group-hover:opacity-100 [@media(hover:none)]:opacity-100 hover:text-foreground'
      ]"
      @click.stop="toggle"
    >
      <IconLikedFilled
        v-if="isLiked"
        class="size-5"
      />
      <IconLike
        v-else
        class="size-5"
      />
    </Button>
    <YtDownloadButton
      v-else-if="ytPlayable"
      :item="ytPlayable"
      icon-only
    />
    <NdDownloadButton
      v-else-if="isNdCatalogRow"
      :track="track"
    />
    <div class="w-7 flex justify-end items-center relative">
      <span :class="styles.duration">
        <!-- Remote rows can have unknown durations (0) — blank beats a fake 0:00. -->
        {{ track.duration > 0 ? formatDuration(track.duration) : "" }}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        :class="styles.dots"
        @click.stop="onDotsClick"
      >
        <IconDots class="size-4" />
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { cva } from "class-variance-authority";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import { computed, useTemplateRef } from "vue";
import { useElementHover } from "@vueuse/core";
import IconDots from "~icons/tabler/dots";
import IconGripVertical from "~icons/tabler/grip-vertical";
import IconLike from "~icons/tabler/heart";
import IconLikedFilled from "~icons/tabler/heart-filled";
import IconPlay from "~icons/audiogram/play-rounded";
import IconPause from "~icons/audiogram/pause-rounded";
import IconLoader from "~icons/tabler/loader-2";

import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import { formatDuration } from "@/lib/format/time";
import { isEphemeralTrack, type PlayerTrack, type Track } from "@/modules/player/types";
import type { TrackContext } from "@/modules/tracks/components/menu/type";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useRouter, type RouteLocationRaw } from "vue-router";
import type { QueueItemId } from "@/types/ids";
import { useToggleTrackLike } from "@/modules/tracks/composables/useToggleTrackLike";
import { useEntityCover } from "@/modules/covers/composables/useEntityCover";
import { sourceCoverUrl, sourceKindOf, THUMB_SIZE_ROW } from "@/modules/sources/lib/display";
import { ytPlayableFromEphemeral } from "@/modules/youtube/lib/playable";
import YtDownloadButton from "@/modules/youtube/components/YtDownloadButton.vue";
import NdDownloadButton from "@/modules/downloads/components/NdDownloadButton.vue";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { routeLocation } from "@/app/router/route-locations";

interface Props {
  track: Track;
  index?: number;
  menuIndex?: number;
  queueItemId?: QueueItemId | null;
  menuTarget?: TrackContext;
  compact?: boolean;
  draggable?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  beingDragged?: boolean;
  hideCover?: boolean;
  coverUrl?: string | null;
  hideIndex?: boolean;
  /**
   * Route overrides for remote (YT) rows whose artists live outside the
   * library — indexes match the comma-split artist list; null = not clickable.
   */
  artistRoutes?: (RouteLocationRaw | null)[];
}

const props = withDefaults(defineProps<Props>(), {
  index: 0,
  menuIndex: undefined,
  queueItemId: null,
  menuTarget: "default",
  compact: false,
  draggable: false,
  highlighted: false,
  dimmed: false,
  beingDragged: false,
  hideCover: false,
  coverUrl: undefined,
  hideIndex: false,
  artistRoutes: undefined,
});

const emit = defineEmits<{
  play: [track: Track];
  dragStart: [event: PointerEvent];
}>();

const playerStore = usePlayerStore();
const queueStore = useQueueStore();
const route = useRouter();
const { toggleTrackLike } = useToggleTrackLike();

const rowRef = useTemplateRef("rowRef");
const isRowHovered = useElementHover(() => rowRef.value);

const isCurrentTrack = computed(() => {
  if (props.queueItemId) {
    return queueStore.currentItem?.id === props.queueItemId;
  }

  if (props.menuTarget === "queue") {
    return false;
  }

  return playerStore.currentTrack?.id === props.track.id;
});
const isPlaying = computed(() => playerStore.isPlaying);
// The clicked row's stream is still resolving — spinner instead of play/pause.
const isTrackLoading = computed(() => isCurrentTrack.value && playerStore.status === "loading");
const showOverlay = computed(() => isCurrentTrack.value || isRowHovered.value);
const isLiked = computed(() => props.track.isLiked);

// Like writes to the library row — remote catalog rows (sourceDto) and
// ephemeral streams have none. YT streams offer download instead; ND gets
// its download button with the download manager (M4).
const isLibraryRow = computed(() =>
  !isEphemeralTrack(props.track as PlayerTrack) && !props.track.sourceDto,
);
const ytPlayable = computed(() => ytPlayableFromEphemeral(props.track as PlayerTrack));
const isNdCatalogRow = computed(() =>
  !!props.track.sourceDto && sourceKindOf(props.track.id) === "nd",
);

const { url: coverBlobUrl } = useEntityCover("album", () => props.track.albumId);
const coverUrl = computed(() => {
  if (props.coverUrl) return props.coverUrl;
  // Remote display rows (ND/YT catalog) carry their cover in the DTO —
  // their albumId points to no local cover blob.
  const coverRef = props.track.sourceDto?.coverRef;
  if (coverRef) {
    return sourceCoverUrl(sourceKindOf(props.track.id), coverRef, THUMB_SIZE_ROW) || "/img/fallback.svg";
  }
  // Queue/history rows also render ephemeral tracks (YT streams, radio):
  // they carry their own cover URL and have no album to look up.
  const track = props.track as PlayerTrack;
  if (isEphemeralTrack(track)) return track.cover ?? "/img/fallback.svg";
  return coverBlobUrl.value ?? "/img/fallback.svg";
});

const artists = computed(() => {
  const artistStr = props.track.artist;
  if (!artistStr) return [];
  return artistStr.split(/,\s*/).map(a => a.trim()).filter(Boolean);
});

const handleArtistClick = (index: number) => {
  if (props.artistRoutes) {
    const to = props.artistRoutes[index] ?? props.artistRoutes[0];
    if (to) route.push(to);
    return;
  }
  const artistId = props.track.artistIds?.[index] ?? props.track.artistIds?.[0];
  if (artistId) {
    route.push(routeLocation.artist(artistId));
  }
};

const styles = {
  root: cva([
    "group track-row flex rounded select-none items-center gap-3 w-full cursor-pointer hover:bg-muted/50 px-2.5",
    "h-16 data-[compact=true]:h-8",
    "focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none focus-visible:border-ring",
  ])(),
  index: "text-center font-semibold text-muted-foreground font-mono w-8 text-base group-data-[compact=true]:w-6 group-data-[compact=true]:text-xs hidden sm:block",
  image: "size-full rounded object-cover",
  imageOverlay: [
    "absolute inset-0 rounded flex items-center justify-center",
    "bg-black/50 transition-opacity duration-200 ease-out",
  ].join(" "),
  info: "flex-1 min-w-0 flex flex-col group-data-[compact=true]:flex-row group-data-[compact=true]:items-baseline group-data-[compact=true]:gap-2",
  title: "font-medium truncate text-base group-data-[compact=true]:text-sm hover:underline",
  artist: "flex items-center text-muted-foreground truncate text-sm group-data-[compact=true]:text-xs",
  duration: "text-muted-foreground font-medium text-sm group-data-[compact=true]:text-xs hidden sm:block sm:group-hover:hidden [@media(hover:none)]:hidden",
  dots: "absolute rounded-full transition-opacity opacity-0 [@media(hover:none)]:opacity-100 sm:group-hover:opacity-100",
};

const {
  openMenu,
  openDropdown,
  activeTrack,
  isDropdownOpen,
  isContextMenuOpen,
} = useTrackMenu();

const resolvedMenuIndex = computed(() => props.menuIndex ?? props.index);

const isMenuSelected = computed(() => {
  return (isDropdownOpen.value || isContextMenuOpen.value)
    && activeTrack.value?.id === props.track.id;
});

const isActivePlayback = computed(() => props.highlighted || isCurrentTrack.value);

const rowStateClass = computed(() => {
  if (isActivePlayback.value) return "bg-primary/10";
  if (isMenuSelected.value) return "bg-accent/80";
  return "";
});

const handleClick = () => {
  if (isCurrentTrack.value) {
    playerStore.togglePlay();
  }
  else {
    emit("play", props.track);
  }
};

const toggle = async () => {
  await toggleTrackLike(props.track);
};

const onContextMenu = () => {
  openMenu(props.track, resolvedMenuIndex.value, {
    queueItemId: props.queueItemId,
    target: props.menuTarget,
  });
};

const onDotsClick = (event: MouseEvent) => {
  openDropdown(props.track, resolvedMenuIndex.value, event, {
    queueItemId: props.queueItemId,
    target: props.menuTarget,
  });
};
</script>
