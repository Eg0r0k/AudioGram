<template>
  <div class="track-expanded-container">
    <div
      ref="rowRef"
      v-ripple
      role="button"
      tabindex="0"
      data-track-row
      :data-track-id="track.id"
      :data-track-index="index - 1"
      :data-disabled="isDisabled || undefined"
      :class="styles.root({ state: rowState })"
      @click="handleClick"
      @keypress.enter="handleClick"
      @contextmenu="emit('contextmenu', track)"
    >
      <div :class="styles.indexCol">
        <Transition
          mode="out-in"
          name="index-swap"
        >
          <button
            v-if="isSelecting"
            key="checkbox"
            class="flex items-center justify-center"
            tabindex="-1"
            @click.stop="onCheckboxClick"
          >
            <Checkbox
              :model-value="isSelected"
              size="lg"
              tabindex="-1"
              aria-hidden="true"
            />
          </button>
          <span
            v-else
            key="index"
            :class="styles.index"
          >
            {{ index }}
          </span>
        </Transition>
      </div>
      <div :class="styles.firstCol">
        <div class="relative z-10 size-10 shrink-0 overflow-hidden rounded bg-muted">
          <NuxtImage
            :src="coverUrl"
            :alt="track.title"
            fallback-src="/img/fallback.svg"
            :class="styles.image"
          />
          <div
            :class="[
              styles.imageOverlay,
              showOverlay && !isSelecting ? 'opacity-100' : 'opacity-0',
            ]"
          >
            <span
              v-if="isCurrentTrack && isPlaying && !isRowHovered"
              class="playing-pulse-dot"
            >
              <span /><span /><span />
            </span>
            <IconPause
              v-else-if="isCurrentTrack && isPlaying && isRowHovered"
              class="size-5 text-white drop-shadow-md"
            />
            <IconPlay
              v-else
              class="size-5 text-white drop-shadow-md"
            />
          </div>
        </div>

        <div class="min-w-0 flex-1">
          <div
            :class="[
              styles.title,
              isActivePlayback ? 'text-primary' : 'text-foreground',
            ]"
          >
            {{ track.title }}
          </div>
          <div :class="styles.artist">
            <span
              v-if="isExplicit"
              class="mr-1.5 inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-muted font-semibold text-[10px] uppercase text-foreground"
            >E</span>
            <template
              v-for="(artist, artistIndex) in artists"
              :key="`${track.id}-${artistIndex}`"
            >
              <span
                role="link"
                tabindex="0"
                class="cursor-pointer truncate underline-offset-2 hover:text-foreground hover:underline"
                @click.stop="handleArtistClick(artistIndex)"
                @keydown.enter.stop="handleArtistClick(artistIndex)"
              >{{ artist }}</span>
              <span v-if="artistIndex < artists.length - 1">,&nbsp;</span>
            </template>
          </div>
        </div>
      </div>

      <div :class="styles.albumCol">
        <span
          v-if="track.albumName"
          role="link"
          tabindex="0"
          class="cursor-pointer truncate underline-offset-2 hover:text-foreground hover:underline"
          @click.stop="handleAlbumClick"
          @keydown.enter.stop="handleAlbumClick"
        >{{ track.albumName }}</span>
      </div>

      <div :class="styles.dateCol">
        {{ relativeAddedAt }}
      </div>

      <div :class="styles.lastCol">
        <span :class="[styles.duration, isSelecting && '!block']">
          {{ formatDuration(track.duration) }}
        </span>

        <div
          v-if="!isSelecting"
          :class="styles.actions"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            :class="[
              'rounded-full transition-colors',
              isLiked
                ? 'text-primary hover:text-primary opacity-100'
                : 'text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
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

          <Button
            variant="ghost"
            size="icon-sm"
            class="rounded-full opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
            @click.stop="onDotsClick"
          >
            <IconDots class="size-4" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { cva } from "class-variance-authority";
import { useElementHover } from "@vueuse/core";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import { formatDuration, formatRelativeTime } from "@/lib/format/time";
import { useEntityCover } from "@/modules/covers/composables/useEntityCover";
import type { Track } from "@/modules/player/types";
import type { TrackContext } from "@/modules/tracks/components/menu/type";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import { useToggleTrackLike } from "@/modules/tracks/composables/useToggleTrackLike";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { routeLocation } from "@/app/router/route-locations";
import IconDots from "~icons/tabler/dots";
import IconLike from "~icons/tabler/heart";
import IconLikedFilled from "~icons/tabler/heart-filled";
import IconPause from "~icons/tabler/player-pause-filled";
import IconPlay from "~icons/tabler/player-play-filled";

const styles = {
  root: cva(
    [
      "group track-expanded flex w-full select-none cursor-pointer items-center rounded-md px-3 h-14",
      "transition-colors outline-none",
      "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
      "data-[disabled]:opacity-50 data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed",
    ],
    {
      variants: {
        state: {
          default: "hover:bg-muted/50",
          active: "bg-primary/10 hover:bg-primary/15",
          selected: "bg-accent/80 hover:bg-accent/90",
        },
      },
      defaultVariants: { state: "default" },
    },
  ),

  indexCol: "index-col flex items-center justify-center",
  index: "text-center text-sm font-medium text-muted-foreground",
  firstCol: "first-col flex min-w-0 items-center gap-3",
  image: "size-full rounded object-cover",
  imageOverlay: "absolute inset-0 flex items-center justify-center rounded bg-black/50 transition-opacity duration-200 ease-out",
  title: "truncate text-sm font-medium hover:underline",
  artist: "flex items-center truncate text-xs text-muted-foreground",
  albumCol: "var1-col min-w-0 truncate pl-2 text-sm text-muted-foreground",
  dateCol: "var2-col min-w-0 truncate pl-2 text-sm text-muted-foreground",
  lastCol: "last-col relative flex items-center justify-end",
  duration: "w-12 text-right text-sm font-medium text-muted-foreground group-hover:hidden [@media(hover:none)]:hidden",
  actions: "absolute right-0 flex items-center gap-1",
} as const;

interface Props {
  track: Track;
  index: number;
  isActive?: boolean;
  isSelected?: boolean;
  isSelecting?: boolean;
  isDisabled?: boolean;
  menuTarget?: TrackContext;
}

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
  isSelected: false,
  isSelecting: false,
  isDisabled: false,
  menuTarget: "default",
});

const emit = defineEmits<{
  play: [track: Track];
  select: [track: Track, event: MouseEvent];
  contextmenu: [track: Track];
}>();

const playerStore = usePlayerStore();
const router = useRouter();
const { locale } = useI18n();
const { openDropdown } = useTrackMenu();
const { toggleTrackLike } = useToggleTrackLike();

const rowRef = useTemplateRef("rowRef");
const isRowHovered = useElementHover(() => rowRef.value);
const { url: coverBlobUrl } = useEntityCover("album", () => props.track.albumId);

const coverUrl = computed(() => coverBlobUrl.value ?? "/img/fallback.svg");

const isCurrentTrack = computed(
  () => props.isActive || playerStore.currentTrack?.id === props.track.id,
);
const isPlaying = computed(() => playerStore.isPlaying);
const isActivePlayback = computed(() => props.isActive || isCurrentTrack.value);
const showOverlay = computed(() => isCurrentTrack.value || isRowHovered.value);
const isExplicit = computed(() => Boolean(props.track.isExplicit));
const isLiked = computed(() => props.track.isLiked);
const relativeAddedAt = computed(() => formatRelativeTime(props.track.addedAt, locale.value));

const artists = computed(() => {
  const artistStr = props.track.artist;
  if (!artistStr) return [];
  return artistStr.split(/,\s*/).map(a => a.trim()).filter(Boolean);
});

const rowState = computed(() => {
  if (props.isSelected) return "selected" as const;
  if (isActivePlayback.value) return "active" as const;
  return "default" as const;
});

function handleClick(event: MouseEvent | KeyboardEvent) {
  if (props.isDisabled) return;
  if (event instanceof MouseEvent) {
    const isModifier = event.metaKey || event.ctrlKey || event.shiftKey;
    if (isModifier || props.isSelecting) {
      emit("select", props.track, event);
      return;
    }
  }
  if (props.isSelecting) {
    emit("select", props.track, new MouseEvent("click"));
    return;
  }
  emit("play", props.track);
}

function onCheckboxClick(event: MouseEvent) {
  event.stopPropagation();
  emit("select", props.track, event);
}

function onDotsClick(event: MouseEvent) {
  openDropdown(props.track, props.index, event, { target: props.menuTarget });
}

async function toggle() {
  await toggleTrackLike(props.track);
}

function handleArtistClick(index: number) {
  const artistId = props.track.artistIds?.[index] ?? props.track.artistIds?.[0];
  if (artistId) router.push(routeLocation.artist(artistId));
}

function handleAlbumClick() {
  if (props.track.albumId) router.push(routeLocation.album(props.track.albumId));
}
</script>

<style scoped>
.track-expanded {
  display: grid;
  grid-template-columns: var(--grid-template-columns);
  gap: 12px;
  align-items: center;
}

.track-expanded-container {
  container-type: inline-size;
}

.index-col { grid-column: index; }
.first-col { grid-column: first; }
.var1-col  { grid-column: var1; }
.var2-col  { grid-column: var2; }
.last-col  { grid-column: last; }

.index-swap-enter-active,
.index-swap-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.index-swap-enter-from,
.index-swap-leave-to {
  opacity: 0;
  transform: scale(0.7);
}

@container (max-width: 900px) {
  .track-expanded {
    --grid-template-columns: var(--grid-template-columns-medium) !important;
  }
  .var2-col { display: none; }
}

@container (max-width: 620px) {
  .track-expanded {
    --grid-template-columns: var(--grid-template-columns-small) !important;
    gap: 8px;
  }
  .index-col,
  .var1-col,
  .var2-col { display: none; }
}
</style>
