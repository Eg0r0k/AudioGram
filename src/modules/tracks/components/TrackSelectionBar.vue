<template>
  <TooltipProvider
    :delay-duration="300"
    disable-hoverable-content
  >
    <div
      ref="rootRef"
      class="track-selection-bar bg-canvas px-5"
    >
      <div class="flex min-w-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          class="shrink-0 rounded-full"
          :aria-label="t('library.selection.exit')"
          :disabled="busy"
          @click="emit('exit')"
        >
          <IconX class="size-5" />
        </Button>
        <Badge class="mx-2">
          {{ count }}
        </Badge>

        <Button
          v-if="!isNarrow"
          variant="ghost"
          size="sm"
          class="shrink-0 text-muted-foreground"
          :disabled="busy || selectingAll"
          @click="toggleSelectAll"
        >
          <IconLoader2
            v-if="selectingAll"
            class="size-4 animate-spin"
          />
          {{ t(allSelected ? 'library.selection.deselectAll' : 'library.selection.selectAll') }}
        </Button>
      </div>

      <div class="flex shrink-0 items-center gap-0.5">
        <template
          v-for="action in visibleActions"
          :key="action.key"
        >
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon-sm"
                class="rounded-full"
                :aria-label="action.label"
                :disabled="actionsDisabled"
                @click="action.run"
              >
                <component
                  :is="action.icon"
                  class="size-5"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {{ action.label }}
            </TooltipContent>
          </Tooltip>
        </template>

        <DropdownMenu
          v-if="!isNarrow"
          @update:open="onPlaylistMenuOpen"
        >
          <Tooltip>
            <TooltipTrigger as-child>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="rounded-full"
                  :aria-label="t('track.contextMenu.addToPlaylist')"
                  :disabled="actionsDisabled"
                >
                  <IconPlaylistAdd class="size-5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {{ t('track.contextMenu.addToPlaylist') }}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            align="end"
            class="min-w-52"
          >
            <DropdownMenuLabel>{{ t('track.contextMenu.addToPlaylist') }}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem @select="handleCreatePlaylist">
              <IconPlus class="size-4" />
              {{ t('track.contextMenu.createPlaylist') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator v-if="playlists.length" />
            <DropdownMenuItem
              v-for="playlist in playlists"
              :key="playlist.id"
              @select="emit('addToPlaylist', playlist.id)"
            >
              <IconPlaylist class="size-4" />
              <span class="truncate">{{ playlist.name }}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              class="rounded-full text-destructive hover:text-destructive"
              :aria-label="t('common.delete')"
              :disabled="actionsDisabled"
              @click="emit('delete')"
            >
              <IconTrash class="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {{ t('common.delete') }}
          </TooltipContent>
        </Tooltip>

        <DropdownMenu
          v-if="isNarrow"
          @update:open="onPlaylistMenuOpen"
        >
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              class="rounded-full"
              :aria-label="t('library.selection.more')"
              :disabled="actionsDisabled"
            >
              <IconDots class="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            class="min-w-52"
          >
            <DropdownMenuItem
              :disabled="selectingAll"
              @select="toggleSelectAll"
            >
              <component
                :is="allSelected ? IconDeselect : IconSelectAll"
                class="size-4"
              />
              {{ t(allSelected ? 'library.selection.deselectAll' : 'library.selection.selectAll') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @select="emit('playNext')">
              <IconPlayerTrackNext class="size-4" />
              {{ t('track.contextMenu.playNext') }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="emit('toggleLike')">
              <component
                :is="allLiked ? IconHeartFilled : IconHeart"
                class="size-4"
              />
              {{ likeLabel }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{{ t('track.contextMenu.addToPlaylist') }}</DropdownMenuLabel>
            <DropdownMenuItem @select="handleCreatePlaylist">
              <IconPlus class="size-4" />
              {{ t('track.contextMenu.createPlaylist') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-for="playlist in playlists"
              :key="playlist.id"
              @select="emit('addToPlaylist', playlist.id)"
            >
              <IconPlaylist class="size-4" />
              <span class="truncate">{{ playlist.name }}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </TooltipProvider>
</template>

<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from "vue";
import type { Component } from "vue";
import { useElementSize } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import IconDeselect from "~icons/tabler/deselect";
import IconDots from "~icons/tabler/dots";
import IconHeart from "~icons/tabler/heart";
import IconHeartFilled from "~icons/tabler/heart-filled";
import IconListNumbers from "~icons/tabler/list-numbers";
import IconLoader2 from "~icons/tabler/loader-2";
import IconPlay from "~icons/tabler/player-play";
import IconPlayerTrackNext from "~icons/tabler/player-track-next";
import IconPlaylist from "~icons/tabler/playlist";
import IconPlaylistAdd from "~icons/tabler/playlist-add";
import IconPlus from "~icons/tabler/plus";
import IconSelectAll from "~icons/tabler/select-all";
import IconTrash from "~icons/tabler/trash";
import IconX from "~icons/tabler/x";
import type { PlaylistId } from "@/types/ids";
import { usePlaylistMenu } from "./menu/composables/usePlaylistMenu";
import Badge from "@/components/ui/badge/Badge.vue";

const props = defineProps<{
  count: number;
  allSelected: boolean;
  allLiked: boolean;
  busy: boolean;
  selectingAll: boolean;
}>();

const emit = defineEmits<{
  exit: [];
  selectAll: [];
  deselectAll: [];
  play: [];
  playNext: [];
  addToQueue: [];
  toggleLike: [];
  addToPlaylist: [playlistId: PlaylistId];
  delete: [];
}>();

// A 1280px window with both side panels open leaves a ~610px column, so a
// higher threshold made the wide bar unreachable on a normal desktop.
const NARROW_PX = 540;

const { t } = useI18n();
const rootRef = useTemplateRef<HTMLElement>("rootRef");
const { width } = useElementSize(rootRef);
const isNarrow = computed(() => width.value > 0 && width.value < NARROW_PX);
const actionsDisabled = computed(() => props.busy || props.count === 0);

const toggleSelectAll = () => {
  if (props.allSelected) emit("deselectAll");
  else emit("selectAll");
};

const likeLabel = computed(() =>
  t(props.allLiked ? "track.contextMenu.removeFromFavorites" : "track.contextMenu.addToFavorites"),
);

interface BarAction {
  key: string;
  label: string;
  icon: Component;
  run: () => void;
  wideOnly?: boolean;
  dividerBefore?: boolean;
}

// Same icon vocabulary as the track context menu (PlayItems, LikeItem,
// AddToPlaylistSub), all tabler outline so the glyphs share one optical size.
// Groups: playback, then library (like + playlist menu), then delete on its own.
const actions = computed<BarAction[]>(() => [
  { key: "play", label: t("track.contextMenu.play"), icon: IconPlay, run: () => emit("play") },
  { key: "playNext", label: t("track.contextMenu.playNext"), icon: IconPlayerTrackNext, run: () => emit("playNext"), wideOnly: true },
  { key: "queue", label: t("track.contextMenu.addToQueue"), icon: IconListNumbers, run: () => emit("addToQueue") },
  {
    key: "like",
    label: likeLabel.value,
    icon: props.allLiked ? IconHeartFilled : IconHeart,
    run: () => emit("toggleLike"),
    wideOnly: true,
    dividerBefore: true,
  },
]);

const visibleActions = computed(() =>
  actions.value.filter(action => !action.wideOnly || !isNarrow.value),
);

const hasOpenedPlaylists = shallowRef(false);
const onPlaylistMenuOpen = (open: boolean) => {
  if (open) hasOpenedPlaylists.value = true;
};
const { playlists, handleCreatePlaylist } = usePlaylistMenu({ enabled: hasOpenedPlaylists });
</script>

<style scoped>
.track-selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 48px;
  color: var(--muted-foreground);
}
</style>
