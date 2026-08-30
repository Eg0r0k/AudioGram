<template>
  <div
    v-ripple
    class="group select-none cursor-pointer rounded-lg p-2 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50"
    :class="fluid ? 'w-full min-w-0' : 'w-40 shrink-0 sm:w-44'"
    data-library-item
    :data-library-menu="canOpenLibraryMenu(item) ? undefined : 'none'"
    data-media-context
    role="button"
    tabindex="0"
    @click="handleClick"
    @keydown.enter="handleClick"
    @contextmenu="handleContextMenu"
  >
    <div class="relative aspect-square z-1 overflow-hidden rounded-md bg-muted shadow-sm">
      <EntityCoverImage
        :owner-type="coverOwnerType"
        :owner-id="item.id"
        :alt="item.title"
        :fallback-src="item.image"
        image-class="size-full object-cover transition-transform duration-200 group-hover:scale-105"
      />

      <Button
        size="icon-lg"
        class="absolute bottom-2 right-2 size-11 rounded-full shadow-lg transition-[opacity,transform,box-shadow] duration-200"
        :class="isActiveSource
          ? 'translate-y-0 opacity-100'
          : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100'"
        @click.prevent.stop="handlePlay"
      >
        <IconPause
          v-if="isPlaying"
          class="size-5 fill-current"
        />
        <IconPlay
          v-else
          class="size-5 fill-current"
        />
      </Button>
    </div>

    <div class="mt-3 min-w-0">
      <div class="flex min-w-0 items-center gap-1.5">
        <p class="truncate text-sm font-medium text-foreground">
          {{ item.title }}
        </p>

        <IconPinFilled
          v-if="item.isPinned"
          class="size-4 shrink-0 text-primary"
        />
      </div>

      <p
        v-if="item.subtitle"
        class="mt-0.5 truncate text-xs text-muted-foreground"
      >
        {{ item.subtitle }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import EntityCoverImage from "@/components/ui/EntityCoverImage.vue";
import { usePlaybackState } from "@/modules/player/composables/usePlaybackState";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { canOpenLibraryMenu, useLibraryMenu } from "@/modules/library/composables/useLibraryMenu";
import type { LibraryItem } from "@/modules/library/types";
import type { QueueSource } from "@/modules/queue/types";
import type { AlbumId, PlaylistId } from "@/types/ids";
import type { CoverOwnerType } from "@/db/entities";
import IconPause from "~icons/audiogram/pause-rounded";
import IconPlay from "~icons/audiogram/play-rounded";
import IconPinFilled from "~icons/tabler/pin-filled";

// A no-hover device (touch) can't reveal the play button, so it stays
// visible there; `fluid` lets a grid size the card instead of the slider width.
const props = defineProps<{
  item: LibraryItem;
  fluid?: boolean;
}>();

const emit = defineEmits<{
  play: [item: LibraryItem];
}>();

const router = useRouter();
const playerStore = usePlayerStore();
const { openMenu } = useLibraryMenu();
// The card renders any collection that plays as a unit — albums on an
// artist page, playlists on a catalog artist's shelf. Both the cover owner
// and the queue source follow item.type rather than assuming "album".
const coverOwnerType = computed<CoverOwnerType>(() =>
  (props.item.type === "playlist" ? "playlist" : "album"),
);

const source = computed<QueueSource>(() =>
  (props.item.type === "playlist"
    ? { type: "playlist", playlistId: props.item.id as PlaylistId }
    : { type: "album", albumId: props.item.id as AlbumId }),
);
const { isActiveSource, isPlaying } = usePlaybackState(() => source.value);

function handleClick() {
  router.push(props.item.to);
}

function handleContextMenu() {
  openMenu(props.item);
}

function handlePlay() {
  if (isActiveSource.value) {
    playerStore.togglePlay();
    return;
  }

  emit("play", props.item);
}
</script>
