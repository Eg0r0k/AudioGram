<template>
  <div class="track-expanded-container">
    <div
      v-ripple
      role="button"
      tabindex="0"
      data-track-row
      :data-track-id="track.id"
      :data-track-index="index - 1"
      :data-disabled="isDisabled || undefined"
      :data-join-top="joinTop || undefined"
      :data-join-bottom="joinBottom || undefined"
      :class="styles.root({ state: rowState })"
      @click="handleClick"
      @keypress.enter="handleClick"
      @contextmenu="emit('contextmenu', track)"
    >
      <div :class="styles.indexCol">
        <Transition name="index-swap">
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
            />
          </button>
          <span
            v-else
            key="index"
            class="relative flex items-center justify-center"
          >
            <span :class="[styles.index, canSwapIndexOnHover && 'index-hover-idle']">{{ index }}</span>
            <span
              v-if="canSwapIndexOnHover"
              class="index-hover-icon absolute size-4 flex items-center justify-center"
            >
              <IconPause
                v-if="showPauseIcon"
                class="size-4 text-foreground"
              />
              <IconPlay
                v-else
                class="size-4 text-foreground"
              />
            </span>
          </span>
        </Transition>
      </div>
      <div :class="styles.firstCol">
        <div
          v-if="showCover"
          class="relative z-10 size-10 shrink-0"
        >
          <div class="relative size-full overflow-hidden rounded bg-muted">
            <NuxtImage
              :src="coverUrl"
              :alt="track.title"
              :width="40"
              :height="40"
              fallback-src="/img/fallback.svg"
              :class="styles.image"
            />
            <div
              :class="[
                styles.imageOverlay,
                isCurrentTrack && !isSelecting ? 'opacity-100' : 'opacity-0',
                !isSelecting && 'group-hover:opacity-100',
              ]"
            >
              <template v-if="showPauseIcon">
                <span class="playing-pulse-dot group-hover:hidden">
                  <span /><span /><span />
                </span>
                <IconPause class="hidden size-4 text-white group-hover:block" />
              </template>
              <IconPlay
                v-else
                class="size-4 text-white"
              />
            </div>
          </div>

          <span
            v-if="isSelecting"
            data-cover-check
            class="cover-check pointer-events-none absolute -right-1.5 -bottom-1.5 rounded-full bg-background p-0.5"
          >
            <Checkbox
              :model-value="isSelected"
              size="sm"
              class="rounded-full"
              tabindex="-1"
            />
          </span>
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
              class="mr-1 inline-flex size-4 font-bold shrink-0 items-center justify-center rounded-[4px] bg-muted  text-[10px] uppercase text-foreground"
            >E</span>
            <IconCheck
              v-if="isDownloaded"
              class="mr-1 size-4 shrink-0 text-foreground"
              :aria-label="$t('downloads.done')"
              :title="$t('downloads.done')"
            />
            <span
              v-if="isMobileLayout"
              class="truncate"
            >{{ track.artist }}</span>
            <template v-else>
              <template
                v-for="(artist, artistIndex) in artists"
                :key="artist"
              >
                <button
                  type="button"
                  class="cursor-pointer truncate underline-offset-2 hover:text-foreground hover:underline"
                  @click.stop="handleArtistClick(artistIndex, $event)"
                >
                  {{ artist }}
                </button>
                <span v-if="artistIndex < artists.length - 1">,&nbsp;</span>
              </template>
            </template>
          </div>
        </div>
      </div>

      <div
        :class="styles.albumCol"
      >
        <button
          v-if="track.albumName"
          type="button"
          class="block w-full min-w-0 cursor-pointer truncate text-left underline-offset-2 hover:text-foreground hover:underline"
          @click.stop="handleAlbumClick($event)"
        >
          {{ track.albumName }}
        </button>
      </div>

      <div :class="styles.dateCol">
        {{ relativeAddedAt }}
      </div>

      <div :class="styles.lastCol">
        <div
          v-if="isSelecting && isLiked"
          class="flex items-center gap-1"
        >
          <span class="flex size-8 items-center justify-center">
            <IconLikedFilled
              data-liked-indicator
              class="size-5 text-primary"
            />
          </span>
          <span class="hidden size-8 [@media(hover:none)]:block" />
        </div>
        <span :class="[styles.duration, !isSelecting && 'group-hover:hidden']">
          <!-- Remote YT rows can have unknown durations (0) — blank beats a fake 0:00. -->
          {{ track.duration > 0 ? formatDuration(track.duration) : "" }}
        </span>

        <div
          v-if="!isSelecting"
          :class="styles.actions"
        >
          <slot name="actions">
            <SourceDownloadButton
              v-if="track.sourceDto"
              :dto="track.sourceDto"
            />
            <Button
              v-if="isLibraryRow"
              variant="ghost"
              size="icon-sm"
              :class="[
                'rounded-full transition-opacity',
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
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { cva } from "class-variance-authority";
import { useDeviceLayout } from "@/composables/useDeviceLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import { formatDuration, formatRelativeTime } from "@/lib/format/time";
import { useTrackRowCover } from "@/modules/tracks/composables/useTrackRowCover";
import type { Track } from "@/modules/player/types";
import type { TrackContext } from "@/modules/tracks/components/menu/type";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import { useToggleTrackLike } from "@/modules/tracks/composables/useToggleTrackLike";
import SourceDownloadButton from "@/modules/downloads/components/SourceDownloadButton.vue";
import type { OfflineCopyEntity } from "@/db/entities";
import { offlineCopyQueries } from "@/queries/offlineCopy.queries";
import { useQuery } from "@tanstack/vue-query";
import type { ArtistId, TrackId } from "@/types/ids";
import { useI18n } from "vue-i18n";
import { useRouter, type RouteLocationRaw } from "vue-router";
import { routeLocation } from "@/app/router/route-locations";
import { getLogger } from "@/lib/logger";
import IconCheck from "~icons/tabler/check";
import IconDots from "~icons/tabler/dots";
import IconLike from "~icons/tabler/heart";
import IconLikedFilled from "~icons/tabler/heart-filled";
import IconPlay from "~icons/audiogram/play-rounded";
import IconPause from "~icons/audiogram/pause-rounded";

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

  indexCol: "index-col relative flex items-center justify-center",
  index: "text-center text-sm font-medium text-muted-foreground",
  firstCol: "first-col flex min-w-0 items-center gap-3",
  image: "size-full rounded object-cover",
  imageOverlay: "absolute inset-0 flex items-center justify-center rounded bg-black/50 transition-opacity duration-200 ease-out",
  title: "truncate text-sm font-medium hover:underline",
  artist: "flex items-center truncate text-xs text-muted-foreground",
  albumCol: "var1-col min-w-0 truncate pl-2 text-sm text-muted-foreground",
  dateCol: "var2-col min-w-0 truncate pl-2 text-sm text-muted-foreground",
  lastCol: "last-col relative flex items-center justify-end",
  duration: "w-12 text-right text-sm font-medium text-muted-foreground [@media(hover:none)]:hidden",
  actions: "absolute right-0 flex items-center gap-1",
} as const;

interface Props {
  track: Track;
  index: number;
  showCover?: boolean;
  /** Direct cover URL override; skips the album cover lookup (remote tracks). */
  coverSrc?: string;
  isActive?: boolean;
  isSelected?: boolean;
  isSelecting?: boolean;
  /** Lets a modifier click start a selection; without it the click just plays. */
  selectable?: boolean;
  /** Squares the top / bottom corners so adjacent selected rows read as one block. */
  joinTop?: boolean;
  joinBottom?: boolean;
  isDisabled?: boolean;
  menuTarget?: TrackContext;
  /**
   * Route overrides for remote (YT) rows whose artists/album live outside the
   * library — indexes match the comma-split artist list; null = not clickable.
   */
  artistRoutes?: (RouteLocationRaw | null)[];
  albumRoute?: RouteLocationRaw | null;
  /**
   * Track id to check for an offline copy when the row itself carries no
   * sourceDto (YT display rows) — drives the check mark by the title.
   */
  downloadId?: TrackId | null;
}

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
  showCover: true,
  coverSrc: undefined,
  isSelected: false,
  isSelecting: false,
  selectable: false,
  joinTop: false,
  joinBottom: false,
  isDisabled: false,
  menuTarget: "default",
  artistRoutes: undefined,
  albumRoute: undefined,
  downloadId: null,
});

const emit = defineEmits<{
  play: [track: Track];
  select: [track: Track, event: MouseEvent];
  contextmenu: [track: Track];
}>();

const playerStore = usePlayerStore();
const router = useRouter();
// Touch layouts tap the row to play, so the artist links inside it are pure
// misclick surface — there they collapse into the plain artist line.
const { isMobileLayout } = useDeviceLayout();
const { locale } = useI18n();
const { openDropdown } = useTrackMenu();
const { toggleTrackLike } = useToggleTrackLike();

const coverUrl = useTrackRowCover(() => props.track, () => props.coverSrc);

const isCurrentTrack = computed(
  () => props.isActive || playerStore.currentTrack?.id === props.track.id,
);
// Immediate loading keeps the pause icon through a start; the delayed
// indicator would let it flash back to play first.
const showPauseIcon = computed(() => isCurrentTrack.value && (playerStore.isPlaying || playerStore.isLoading));
const isActivePlayback = computed(() => props.isActive || isCurrentTrack.value);
// Hover states are CSS (`group-hover`, `.index-hover-*`): a JS hover tracker
// per row re-rendered the rows under the pointer on every scroll step.
const canSwapIndexOnHover = computed(() => !props.showCover && !props.isDisabled);
const isExplicit = computed(() => Boolean(props.track.isExplicit));
const isLiked = computed(() => props.track.isLiked);
// Like writes to the library row — remote catalog rows (sourceDto) have
// none, so the default action set drops the button for them; ND catalog
// rows get the offline download button in its place (M4).
const isLibraryRow = computed(() => !props.track.sourceDto);
// The downloaded check by the title: catalog rows carry their DTO id, YT
// display rows pass downloadId explicitly.
const offlineTrackId = computed(() => props.downloadId ?? props.track.sourceDto?.id ?? null);
// A local library row has no offline copy to look up: no query observer for
// it. Rows are keyed by track id, so a row never turns remote after mount.
const offlineCopy = offlineTrackId.value === null
  ? shallowRef<OfflineCopyEntity | null | undefined>(undefined)
  : useQuery(computed(() => offlineCopyQueries.detail(offlineTrackId.value))).data;
const isDownloaded = computed(() => !!offlineCopy.value);
const relativeAddedAt = computed(() =>
  props.track.addedAt ? formatRelativeTime(props.track.addedAt, locale.value) : "",
);

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
    if (props.isSelecting || (isModifier && props.selectable)) {
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

// Navigating away in select mode unmounts the page and drops the selection,
// so the links become part of the row's select surface instead.
function handleArtistClick(index: number, event: MouseEvent) {
  if (props.isSelecting) {
    emit("select", props.track, event);
    return;
  }
  if (props.artistRoutes) {
    const to = props.artistRoutes[index] ?? props.artistRoutes[0];
    if (to) router.push(to).catch(error => getLogger().error(`[Tracks] Navigation to the artist page failed: ${String(error)}`));
    return;
  }
  const artistId = (props.track.artistIds[index] as ArtistId | undefined)
    ?? props.track.artistIds[0];
  if (artistId) router.push(routeLocation.artist(artistId)).catch(error => getLogger().error(`[Tracks] Navigation to the artist page failed: ${String(error)}`));
}

function handleAlbumClick(event: MouseEvent) {
  if (props.isSelecting) {
    emit("select", props.track, event);
    return;
  }
  if (props.artistRoutes || props.albumRoute !== undefined) {
    if (props.albumRoute) router.push(props.albumRoute).catch(error => getLogger().error(`[Tracks] Navigation to the album page failed: ${String(error)}`));
    return;
  }
  if (props.track.albumId) router.push(routeLocation.album(props.track.albumId)).catch(error => getLogger().error(`[Tracks] Navigation to the album page failed: ${String(error)}`));
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

.track-expanded[data-join-top] {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.track-expanded[data-join-bottom] {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.index-col { grid-column: index; }
.first-col { grid-column: first; }
.var1-col  { grid-column: var1; }
.var2-col  { grid-column: var2; }
.last-col  { grid-column: last; }

.index-swap-enter-active,
.index-swap-leave-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}
/* Leave element is taken out of flow so enter/leave crossfade in place
   instead of playing sequentially. */
.index-swap-leave-active {
  position: absolute;
}
.index-swap-enter-from,
.index-swap-leave-to {
  opacity: 0;
  transform: scale(0.7);
}

/* Index ↔ play/pause swap on hover, in CSS: the same crossfade the
   Transition above plays for the selection checkbox. */
.index-hover-idle,
.index-hover-icon {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}
.index-hover-icon {
  opacity: 0;
  transform: scale(0.7);
}
@media (hover: hover) {
  .track-expanded:hover .index-hover-idle {
    opacity: 0;
    transform: scale(0.7);
  }
  .track-expanded:hover .index-hover-icon {
    opacity: 1;
    transform: none;
  }
}

@container (max-width: 900px) {
  .track-expanded {
    --grid-template-columns: var(--grid-template-columns-medium) !important;
  }
  .var2-col { display: none; }
}

/* The selection checkbox lives in the index column; where that column is
   gone it moves onto the cover's corner. */
.cover-check { display: none; }
@container (max-width: 620px) {
  .track-expanded {
    --grid-template-columns: var(--grid-template-columns-small) !important;
    gap: 8px;
  }
  .index-col,
  .var1-col,
  .var2-col { display: none; }
  .cover-check { display: flex; }
}
</style>
