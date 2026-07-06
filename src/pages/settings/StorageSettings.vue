<template>
  <Scrollable
    direction="vertical"
    class="flex-1"
  >
    <div class="pb-8">
      <SettingsHeader :title="$t('settings.index.storage')" />

      <SettingsGroup>
        <Item>
          <ItemMedia>
            <div class="relative size-10 shrink-0 z-1">
              <svg
                class="size-10 -rotate-90"
                viewBox="0 0 36 36"
              >
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  class=" text-background"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  class="text-primary transition-[stroke-dashoffset] duration-300"
                  :stroke-dasharray="`${2 * Math.PI * 15}`"
                  :stroke-dashoffset="`${2 * Math.PI * 15 * (1 - (formatted.usagePercent || 0) / 100)}`"
                />
              </svg>
              <span class="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
                {{ formatted.usagePercent || 0 }}%
              </span>
            </div>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{{ $t('settings.storage.usage') }}</ItemTitle>
            <ItemSubtitle v-if="isLoading">
              {{ $t('common.loading') }}
            </ItemSubtitle>
            <ItemSubtitle v-else>
              {{ formatted.totalUsed }} {{ $t('settings.storage.used') }}
              <template v-if="formatted.quotaTotal">
                · {{ formatted.quotaFree }} {{ $t('settings.storage.free') }}
              </template>
            </ItemSubtitle>
          </ItemContent>
        </Item>
      </SettingsGroup>

      <SettingsGroup class="mt-3 mb-3">
        <div class="px-4 py-3">
          <div class="text-primary font-medium mb-1">
            {{ $t("settings.storage.sizeTitle") }}
          </div>
        </div>
        <Item>
          <ItemMedia>
            <MusicIcon class="size-6 mr-3" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{{ $t('settings.storage.database') }}</ItemTitle>
            <ItemSubtitle v-if="isLoading">
              {{ $t('common.loading') }}
            </ItemSubtitle>
            <ItemSubtitle v-else>
              {{ formatted.tracksCount }} {{ $t('settings.storage.tracksCount') }}
              · {{ formatted.albumsCount }} {{ $t('settings.storage.albumsCount') }}
              · {{ formatted.artistsCount }} {{ $t('settings.storage.artistsCount') }} ({{ formatted.dbSize }})
            </ItemSubtitle>
          </ItemContent>
        </Item>
        <Item>
          <ItemMedia>
            <MusicIcon class="size-6 mr-3" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{{ $t('settings.storage.tracks') }}</ItemTitle>
            <ItemSubtitle v-if="isLoading">
              {{ $t('common.loading') }}
            </ItemSubtitle>
            <ItemSubtitle v-else>
              <span class="text-sm text-muted-foreground">{{ formatted.tracksSize }}</span>
            </ItemSubtitle>
          </ItemContent>
          <ItemActions />
        </Item>

        <Item>
          <ItemMedia>
            <FileTextIcon class="size-6 mr-3" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{{ $t('settings.storage.lyrics') }}</ItemTitle>
            <ItemSubtitle v-if="isLoading">
              {{ $t('common.loading') }}
            </ItemSubtitle>
            <ItemSubtitle v-else>
              <span class="text-sm text-muted-foreground">{{ formatted.lyricsSize }}</span>
            </ItemSubtitle>
          </ItemContent>
          <ItemActions class="pointer-events-auto">
            <Button
              variant="ghost-primary"
              size="sm"
              :disabled="isLoading || isClearing"
              @click="clearLyricsData"
            >
              {{ $t("common.delete") }}
              <TrashIcon class="size-4" />
            </Button>
          </ItemActions>
        </Item>
        <Item>
          <ItemMedia>
            <FolderIcon class="size-6 mr-3" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{{ $t('settings.storage.folders') }}</ItemTitle>
            <ItemSubtitle>
              <span class="text-sm text-muted-foreground">{{ $t('settings.storage.foldersDesc') }}</span>
            </ItemSubtitle>
          </ItemContent>
          <ItemActions class="pointer-events-auto">
            <Button
              variant="ghost-primary"
              size="sm"
              :disabled="isLoading || isClearing"
              @click="clearFoldersData"
            >
              {{ $t("common.delete") }}
              <TrashIcon class="size-4" />
            </Button>
          </ItemActions>
        </Item>
        <Item>
          <ItemMedia>
            <ClockIcon class="size-6 mr-3" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{{ $t('settings.storage.timings') }}</ItemTitle>
            <ItemSubtitle>
              <span class="text-sm text-muted-foreground">{{ $t('settings.storage.timingsDesc') }}</span>
            </ItemSubtitle>
          </ItemContent>
          <ItemActions class="pointer-events-auto">
            <Button
              variant="ghost-primary"
              size="sm"
              :disabled="isLoading || isClearing"
              @click="clearTimingsData"
            >
              {{ $t("common.delete") }}
              <TrashIcon class="size-4" />
            </Button>
          </ItemActions>
        </Item>
        <Item v-copy="{ text: formatted.storagePath, onCopy: handleStoragePathCopied }">
          <ItemContent>
            <ItemTitle>{{ $t('settings.storage.location') }}</ItemTitle>
            <ItemSubtitle v-if="isLoading">
              {{ $t('common.loading') }}
            </ItemSubtitle>
            <ItemSubtitle
              v-else
              class="break-all"
            >
              {{ formatted.storagePath }}
            </ItemSubtitle>
          </ItemContent>
        </Item>
        <Button
          class="w-full h-14 justify-start  "
          variant="ghost-primary"
          size="xl"
          @click="clearAllData"
        >
          <TrashIcon class=" size-6" />
          {{ $t('settings.storage.clearAll') }}
        </Button>
      </SettingsGroup>
      <WatchedFoldersSection
        v-if="IS_TAURI"
      />
    </div>
  </Scrollable>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemSubtitle,
  ItemTitle,
} from "@/components/ui/item";

import { Scrollable } from "@/components/ui/scrollable";

import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import SettingsHeader from "@/modules/settings/components/SettingsHeader.vue";

import { useStorageSettings } from "@/modules/settings/store/storage";

import TrashIcon from "~icons/tabler/trash";
import FileTextIcon from "~icons/tabler/file-text";
import MusicIcon from "~icons/tabler/music";
import FolderIcon from "~icons/tabler/folder";
import ClockIcon from "~icons/tabler/clock";

import { Button } from "@/components/ui/button";
import { IS_TAURI } from "@/lib/environment/userAgent";
import WatchedFoldersSection from "@/modules/watched-folders/components/WatchedFoldersSection.vue";

const {
  isLoading,
  isClearing,
  formatted,
  refresh,
  clearAllData,
  clearLyricsData,
  clearFoldersData,
  clearTimingsData,
} = useStorageSettings();

const { t } = useI18n();

const handleStoragePathCopied = () => {
  toast.success(t("settings.storage.locationCopied"));
};

onMounted(() => {
  refresh();
});
</script>
