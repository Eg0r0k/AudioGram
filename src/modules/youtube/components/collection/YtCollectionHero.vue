<template>
  <div class="relative @container">
    <div
      class="absolute inset-0 transition-opacity duration-400 ease-standard pointer-events-none"
      :class="colorReady ? 'opacity-100' : 'opacity-0'"
      :style="{ background: `linear-gradient(${color.hsl} 0%, transparent 140%)` }"
    />

    <MediaHeader
      :title="title"
      :color="colorReady ? color.hsl : null"
      @play="emit('play')"
    />

    <div class="relative flex min-h-[265px] flex-col items-center gap-5 px-4 pb-6 pt-[72px] text-center @lg:flex-row @lg:items-end @lg:gap-7 @lg:px-7 @lg:pb-7 @lg:text-left">
      <div class="w-full max-w-44 mb-auto shrink-0 @sm:max-w-52 @lg:max-w-[232px]">
        <MediaHeroImage
          :src="imageSrc"
          :alt="title"
        />
      </div>

      <div class="flex select-none min-w-0 w-full flex-col items-center text-white @lg:items-start">
        <span class="mb-1 text-xs font-medium opacity-90 @sm:text-sm">
          {{ typeLabel }}
        </span>

        <h1 class="w-full wrap-break-word text-balance font-black leading-none tracking-tight text-3xl @sm:text-4xl @md:text-5xl @xl:text-6xl">
          {{ title }}
        </h1>

        <p
          v-if="linkedArtists.length || metaLine"
          class="mt-3 text-sm font-medium text-white/90"
        >
          <template v-if="linkedArtists.length">
            <template
              v-for="(artist, i) in linkedArtists"
              :key="artist.name"
            >
              <button
                v-if="artist.id"
                type="button"
                class="cursor-pointer underline-offset-2 hover:underline"
                @click="emit('openArtist', artist.id)"
              >
                {{ artist.name }}
              </button>
              <span v-else>{{ artist.name }}</span>
              <span v-if="i < linkedArtists.length - 1">, </span>
            </template>
            <span v-if="metaLine"> · {{ metaLine }}</span>
          </template>
          <template v-else>
            {{ metaLine }}
          </template>
        </p>

        <p
          v-if="description"
          class="mt-3 max-w-2xl text-sm leading-6 text-white/80 line-clamp-3 @lg:max-w-none"
        >
          {{ description }}
        </p>

        <div class="mt-5 w-full @lg:mt-6">
          <div class="@container flex flex-col items-center gap-4 @md:flex-row @md:items-center @md:justify-between">
            <div class="flex flex-wrap items-center justify-center gap-3 @md:justify-start">
              <Button
                class="size-14 rounded-full"
                :disabled="!hasTracks"
                @click="emit('play')"
              >
                <IconPlay class="size-5 fill-current" />
              </Button>

              <Button
                class="rounded-full text-white"
                size="icon-lg"
                variant="ghost"
                :disabled="!hasTracks"
                @click="emit('shuffle')"
              >
                <IconShuffle class="size-5" />
              </Button>
            </div>

            <div class="flex flex-wrap items-center justify-center gap-2 @md:justify-end">
              <Button
                class="text-white"
                variant="ghost"
                :disabled="!hasTracks"
                @click="emit('import')"
              >
                <IconDownload class="size-5" />
                {{ $t("youtube.importToLibrary") }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { useImageColor } from "@/composables/useImageColor";
import MediaHeader from "@/modules/media-hero/components/MediaHeader.vue";
import MediaHeroImage from "@/modules/media-hero/components/MediaHeroImage.vue";
import { proxiedThumbnail } from "../../lib/thumbnail";
import type { YtArtistRef } from "../../types";
import IconDownload from "~icons/tabler/download";
import IconPlay from "~icons/audiogram/play-rounded";
import IconShuffle from "~icons/tabler/arrows-shuffle";

const props = defineProps<{
  title: string;
  kind: "playlist" | "album";
  owner?: string | null;
  /** Album artists with channel ids — rendered as links to the YT artist page. */
  artists?: YtArtistRef[];
  description?: string | null;
  trackCount?: number | null;
  thumbnail?: string | null;
  hasTracks?: boolean;
}>();

const emit = defineEmits<{
  play: [];
  shuffle: [];
  import: [];
  openArtist: [artistId: string];
}>();

const { t } = useI18n();

const imageSrc = computed(() =>
  props.thumbnail ? proxiedThumbnail(props.thumbnail) : "/img/fallback.svg",
);

const typeLabel = computed(() =>
  props.kind === "album" ? t("media.type.album") : t("media.type.playlist"),
);

const linkedArtists = computed(() => props.artists ?? []);

const metaLine = computed(() => {
  const parts: string[] = [];
  if (props.owner && !linkedArtists.value.length) parts.push(t("youtube.by", { name: props.owner }));
  if (props.trackCount != null) parts.push(t("youtube.tracksCount", { count: props.trackCount }));
  return parts.join(" · ") || null;
});

const { color, extractColor, resetColor } = useImageColor();
const colorReady = ref(false);

watch(
  () => imageSrc.value,
  async (newImage, oldImage) => {
    if (newImage === oldImage) return;

    colorReady.value = false;
    await nextTick();

    if (newImage && newImage !== "/img/fallback.svg") {
      await extractColor(newImage);
    }
    else {
      resetColor();
    }

    colorReady.value = true;
  },
  { immediate: true },
);
</script>
