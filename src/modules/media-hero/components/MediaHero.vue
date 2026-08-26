<template>
  <MediaContextMenu
    :context="contextType"
    :is-playlist-owner="isPlaylist(data) ? data.isOwner : undefined"
    :disabled="!hasMenuItems"
  >
    <div
      class="relative @container"
      data-media-context
    >
      <div
        class="absolute inset-0 transition-opacity duration-400 ease-standard pointer-events-none"
        :class="colorReady ? 'opacity-100' : 'opacity-0'"
        :style="{ background: `linear-gradient(${color.hsl} 0%, transparent 140%)` }"
      />

      <MediaHeader
        :title="data.title"
        :color="colorReady ? color.hsl : null"
        @play="$emit('play')"
      />

      <div class="relative flex min-h-[265px] flex-col items-center gap-5 px-4 pb-6 pt-[72px] text-center @lg:flex-row @lg:items-end @lg:gap-7 @lg:px-7 @lg:pb-7 @lg:text-left">
        <div class="w-full max-w-44 mb-auto shrink-0 @sm:max-w-52 @lg:max-w-[232px]">
          <MediaHeroImage
            :src="data.image"
            :alt="data.title"
            :rounded="isArtist(data)"
            :editable="canEdit"
            :fallback-src="fallbackSrc"
            @edit="$emit('edit')"
          />
        </div>

        <div class="flex select-none min-w-0 w-full flex-col items-center text-white @lg:items-start">
          <span class="mb-1 text-xs font-medium opacity-90 @sm:text-sm">
            {{ typeLabel }}
          </span>

          <h1
            class="w-full wrap-break-word text-balance font-black leading-none tracking-tight text-3xl @sm:text-4xl @md:text-5xl @xl:text-6xl"
          >
            {{ data.title }}
          </h1>

          <MediaHeroMeta
            class="mt-3 text-white font-medium"
            :data="data"
          />

          <p
            v-if="descriptionText"
            class="mt-3 max-w-2xl text-sm leading-6 text-white/80 line-clamp-3 @lg:max-w-none"
          >
            {{ descriptionText }}
          </p>

          <MediaHeroActions
            class="mt-5 w-full @lg:mt-6"
            :type="data.type"
            :source="heroSource"
            :has-tracks="props.hasTracks"
            :is-playlist-owner="isPlaylist(data) ? data.isOwner : undefined"
            :show-menu="hasMenuItems"
            @play="$emit('play')"
            @shuffle="$emit('shuffle')"
          >
            <template #actions>
              <slot name="actions" />
            </template>
          </MediaHeroActions>
        </div>
      </div>
    </div>
  </MediaContextMenu>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { useImageColor } from "@/composables/useImageColor";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { sourceKindOf } from "@/modules/sources/lib/display";
import {
  enqueueLocalPlaylistDownload,
  enqueueNdAlbumDownload,
  enqueueNdPlaylistDownload,
} from "@/modules/downloads/enqueue";
import { provideMediaContext } from "@/modules/media-hero/composables/useMediaContext";
import MediaHeader from "./MediaHeader.vue";
import MediaHeroImage from "./MediaHeroImage.vue";
import MediaContextMenu from "./menu/context-menu/MediaContextMenu.vue";
import MediaHeroMeta from "./MediaHeroMeta.vue";
import MediaHeroActions from "./MediaHeroActions.vue";
import type { QueueSource } from "@/modules/queue/types";
import { isAlbum, isArtist, isLiked, isPlaylist, MediaData } from "../types";

const props = withDefaults(defineProps<{
  data: MediaData;
  hasTracks?: boolean;
  /**
   * False on live catalog pages (ND browsing): the hero shows a server VM
   * with no Dexie row, so editing/deleting it would write nowhere.
   */
  isLibraryEntity?: boolean;
}>(), {
  isLibraryEntity: true,
});

const emit = defineEmits<{
  edit: [];
  delete: [];
  play: [];
  shuffle: [];
  addToQueue: [];
  share: [];
}>();

const { t } = useI18n();

const fallbackSrc = computed(() => {
  return isArtist(props.data)
    ? "/img/artist-fallback.svg"
    : "/img/fallback.svg";
});

/**
 * Edit/delete need a Dexie row behind the hero. Live catalog pages (ND
 * album/artist/playlist) render a VM built straight from the server, so the
 * page tells us via `isLibraryEntity` — a downloaded yt/nd album DOES have a
 * row and stays manageable.
 */
const canManage = computed(() => {
  if (!props.isLibraryEntity) return false;
  return isPlaylist(props.data) ? props.data.isOwner : true;
});

// M4: batch offline download — ND albums and playlists (a local playlist is
// filtered to its downloadable tracks at enqueue time).
const canDownloadOffline = computed(() => {
  if (!IS_TAURI) return false;
  const data = props.data;
  if (isAlbum(data)) return sourceKindOf(data.id) === "nd";
  return isPlaylist(data);
});

async function startOfflineDownload(): Promise<void> {
  const data = props.data;
  try {
    let batchId: string | null = null;
    if (isAlbum(data)) {
      batchId = await enqueueNdAlbumDownload(data.id);
    }
    else if (isPlaylist(data)) {
      batchId = sourceKindOf(data.id) === "nd"
        ? await enqueueNdPlaylistDownload(String(data.id).slice("nd:".length))
        : await enqueueLocalPlaylistDownload(data.id);
    }
    // No "queued" toast: the header download indicator is the feedback.
    if (!batchId) {
      toast.info(t("media.nothingToDownload"));
    }
  }
  catch {
    toast.error(t("track.downloadFailed"));
  }
}

provideMediaContext({
  addToQueue: () => emit("addToQueue"),
  edit: () => emit("edit"),
  delete: () => emit("delete"),
  share: () => emit("share"),
  canManage,
  canDownloadOffline,
  downloadOffline: () => {
    startOfflineDownload();
  },
});

const { color, extractColor, resetColor } = useImageColor();
const colorReady = ref(false);

watch(
  () => props.data.image,
  async (newImage, oldImage) => {
    if (newImage === oldImage) return;

    colorReady.value = false;
    await nextTick();

    if (newImage) {
      await extractColor(newImage);
    }
    else {
      resetColor();
    }

    colorReady.value = true;
  },
  { immediate: true },
);

const heroSource = computed<QueueSource>(() => {
  const d = props.data;
  if (isAlbum(d)) return { type: "album", albumId: d.id };
  if (isArtist(d)) return { type: "artist", artistId: d.id };
  if (isPlaylist(d)) return { type: "playlist", playlistId: d.id };
  if (isLiked(d)) return { type: "liked" };
  return { type: "unknown" };
});

const canEdit = computed(() =>
  canManage.value && (isPlaylist(props.data) || isAlbum(props.data) || isArtist(props.data)),
);

// Mirrors what the context components render: an empty menu (e.g. catalog
// artist) never opens, and the "⋯" trigger hides with it.
const hasMenuItems = computed(() => {
  switch (contextType.value) {
    case "artist-page": return canManage.value;
    case "album": return canManage.value || canDownloadOffline.value;
    default: return true;
  }
});

const descriptionText = computed(() => {
  if (isPlaylist(props.data)) {
    return props.data.description?.trim() || null;
  }

  if (isArtist(props.data)) {
    return props.data.bio?.trim() || null;
  }

  return null;
});
const contextType = computed(() => {
  switch (props.data.type) {
    case "artist": return "artist-page";
    case "liked": return "liked";
    case "playlist": return "playlist";
    case "album": return "album";
    default: return "album";
  }
});

const typeLabel = computed(() => {
  switch (props.data.type) {
    case "playlist": return t("media.type.playlist");
    case "artist": return t("media.type.artist");
    case "album": return t("media.type.album");
    case "liked": return t("media.type.playlist");
    default: return t("media.type.album");
  }
});
</script>
