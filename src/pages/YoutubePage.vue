<template>
  <div class="flex min-h-0 flex-1 flex-col bg-background">
    <div class="px-6 pb-2 pt-4">
      <div class="flex items-center gap-3">
        <IconYoutube class="size-7 text-red-500 shrink-0" />
        <h1 class="text-2xl font-bold">
          {{ t('youtube.title') }}
        </h1>
      </div>

      <form
        class="mt-4 flex gap-2"
        @submit.prevent="onSearch"
      >
        <InputGroup class="bg-muted! min-w-0 flex-1 rounded-full">
          <InputGroupAddon tabindex="-1">
            <IconSearch class="ml-1 size-4.5 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            v-model="query"
            class="pl-3! text-[15px]"
            :placeholder="t('youtube.searchPlaceholder')"
            :disabled="!isAvailable"
            @keydown.stop
          />
        </InputGroup>
        <Button
          type="submit"
          class="rounded-full"
          :disabled="!isAvailable || isSearching || !query.trim()"
        >
          <IconLoader
            v-if="isSearching"
            class="size-4.5 animate-spin"
          />
          <span v-else>{{ t('youtube.search') }}</span>
        </Button>
      </form>
    </div>

    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6">
      <p
        v-if="error && hasResults"
        class="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
      >
        {{ errorText }}
      </p>

      <p
        v-if="!isAvailable"
        class="py-12 text-center text-sm text-muted-foreground"
      >
        {{ t('youtube.unavailable') }}
      </p>

      <p
        v-else-if="error && !hasResults"
        class="py-12 text-center text-sm text-destructive"
      >
        {{ errorText }}
      </p>

      <p
        v-else-if="!hasResults"
        class="py-12 text-center text-sm text-muted-foreground"
      >
        {{ query.trim() ? t('youtube.noResults', { query: query.trim() }) : t('youtube.empty') }}
      </p>

      <ul
        v-else
        class="flex flex-col gap-1"
      >
        <li
          v-for="video in results"
          :key="video.id"
          class="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/60"
        >
          <button
            type="button"
            class="group flex min-w-0 flex-1 items-center gap-3 text-left"
            :disabled="!isAvailable || store.resolvingId !== null"
            @click="play(video)"
          >
            <div class="relative h-12 w-20 shrink-0 overflow-hidden rounded bg-muted">
              <img
                v-if="video.thumbnail"
                :src="video.thumbnail"
                alt=""
                loading="lazy"
                class="h-full w-full object-cover"
              >
              <span
                v-if="video.duration"
                class="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 text-[10px] leading-tight text-white"
              >
                {{ formatDuration(video.duration) }}
              </span>
              <span
                class="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100"
                :class="{ 'opacity-100': store.resolvingId === video.id }"
              >
                <IconLoader
                  v-if="store.resolvingId === video.id"
                  class="size-5 animate-spin text-white"
                />
                <IconPlay
                  v-else
                  class="size-5 text-white"
                />
              </span>
            </div>

            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {{ video.title }}
              </p>
              <p
                v-if="video.uploader"
                class="truncate text-xs text-muted-foreground"
              >
                {{ video.uploader }}
              </p>
              <p
                v-if="statusOf(video.id) === 'error'"
                class="truncate text-xs text-destructive"
              >
                {{ store.downloads[video.id]?.error }}
              </p>
            </div>
          </button>

          <Button
            size="sm"
            variant="ghost-primary"
            class="shrink-0 rounded-full"
            :disabled="isBusy(video.id)"
            @click="download(video)"
          >
            <IconCheck
              v-if="statusOf(video.id) === 'done'"
              class="size-4.5 text-green-500"
            />
            <IconAlert
              v-else-if="statusOf(video.id) === 'error'"
              class="size-4.5 text-destructive"
            />
            <IconLoader
              v-else-if="isBusy(video.id)"
              class="size-4.5 animate-spin"
            />
            <IconDownload
              v-else
              class="size-4.5"
            />
            <span class="ml-1 text-xs">{{ buttonLabel(video.id) }}</span>
          </Button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { useYoutube } from "@/modules/youtube/composables/useYoutube";
import type { YtDownloadStatus } from "@/modules/youtube/store/youtube.store";
import IconYoutube from "~icons/tabler/brand-youtube";
import IconSearch from "~icons/tabler/search";
import IconDownload from "~icons/tabler/download";
import IconCheck from "~icons/tabler/check";
import IconAlert from "~icons/tabler/alert-triangle";
import IconLoader from "~icons/tabler/loader-2";
import IconPlay from "~icons/tabler/player-play-filled";

const { t } = useI18n();
const { store, download, play } = useYoutube();
const { query, results, isSearching, error, isAvailable, hasResults } = storeToRefs(store);

const onSearch = () => store.search();

const errorText = computed(() => {
  const message = error.value?.message ?? "";
  if (/not a bot|sign in to confirm/i.test(message)) return t("youtube.botError");
  return t("youtube.errorPrefix", { message });
});

function statusOf(id: string): YtDownloadStatus | null {
  return store.downloads[id]?.status ?? null;
}

function isBusy(id: string): boolean {
  const status = statusOf(id);
  return status === "downloading" || status === "processing" || status === "importing";
}

function buttonLabel(id: string): string {
  const state = store.downloads[id];
  switch (state?.status) {
    case "downloading":
      return state.percent === null
        ? t("youtube.downloading")
        : `${state.percent}%`;
    case "processing":
      return t("youtube.processing");
    case "importing":
      return t("youtube.importing");
    case "done":
      return t("youtube.done");
    case "error":
      return t("youtube.failed");
    default:
      return t("youtube.download");
  }
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
</script>
