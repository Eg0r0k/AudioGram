<template>
  <div
    ref="rootRef"
    class="track-selection-bar border-b border-border/40 px-4 sm:px-6"
  >
    <div class="flex min-w-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        class="shrink-0 rounded-full"
        :aria-label="t('library.selection.exit')"
        :title="t('library.selection.exit')"
        :disabled="busy"
        @click="emit('exit')"
      >
        <IconX class="size-5" />
      </Button>

      <span class="truncate text-sm font-medium text-foreground">
        {{ t('library.selection.count', count) }}
      </span>

      <Button
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
      <Motion
        v-for="(action, i) in visibleActions"
        :key="action.key"
        :initial="{ opacity: 0, y: 6 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.18, delay: i * 0.02, ease: EASE }"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          class="rounded-full"
          :aria-label="action.label"
          :title="action.label"
          :disabled="actionsDisabled"
          @click="action.run"
        >
          <component
            :is="action.icon"
            class="size-5"
          />
        </Button>
      </Motion>

      <DropdownMenu
        v-if="!isNarrow"
        @update:open="onPlaylistMenuOpen"
      >
        <DropdownMenuTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            class="rounded-full"
            :aria-label="t('track.contextMenu.addToPlaylist')"
            :title="t('track.contextMenu.addToPlaylist')"
            :disabled="actionsDisabled"
          >
            <IconPlaylistAdd class="size-5" />
          </Button>
        </DropdownMenuTrigger>
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

      <Motion
        :initial="{ opacity: 0, y: 6 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.18, delay: visibleActions.length * 0.02, ease: EASE }"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          class="rounded-full text-destructive hover:text-destructive"
          :aria-label="t('common.delete')"
          :title="t('common.delete')"
          :disabled="actionsDisabled"
          @click="emit('delete')"
        >
          <IconTrash class="size-5" />
        </Button>
      </Motion>

      <DropdownMenu @update:open="onPlaylistMenuOpen">
        <DropdownMenuTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            class="rounded-full"
            :aria-label="t('library.selection.more')"
            :title="t('library.selection.more')"
            :disabled="actionsDisabled"
          >
            <IconDots class="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          class="min-w-52"
        >
          <DropdownMenuItem @select="emit('playNext')">
            <IconPlayerTrackNext class="size-4" />
            {{ t('track.contextMenu.playNext') }}
          </DropdownMenuItem>
          <template v-if="isNarrow">
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
          </template>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from "vue";
import type { Component } from "vue";
import { useElementSize } from "@vueuse/core";
import { Motion } from "motion-v";
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
import IconDots from "~icons/tabler/dots";
import IconHeart from "~icons/tabler/heart";
import IconHeartFilled from "~icons/tabler/heart-filled";
import IconListCheck from "~icons/tabler/list-check";
import IconLoader2 from "~icons/tabler/loader-2";
import IconPlayerPlay from "~icons/tabler/player-play";
import IconPlayerTrackNext from "~icons/tabler/player-track-next";
import IconPlaylist from "~icons/tabler/playlist";
import IconPlaylistAdd from "~icons/tabler/playlist-add";
import IconPlus from "~icons/tabler/plus";
import IconTrash from "~icons/tabler/trash";
import IconX from "~icons/tabler/x";
import type { PlaylistId } from "@/types/ids";
import { usePlaylistMenu } from "./menu/composables/usePlaylistMenu";

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

const EASE = [0.22, 1, 0.36, 1] as const;
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
}

const actions = computed<BarAction[]>(() => [
  { key: "play", label: t("track.contextMenu.play"), icon: IconPlayerPlay, run: () => emit("play") },
  { key: "queue", label: t("track.contextMenu.addToQueue"), icon: IconListCheck, run: () => emit("addToQueue") },
  {
    key: "like",
    label: likeLabel.value,
    icon: props.allLiked ? IconHeartFilled : IconHeart,
    run: () => emit("toggleLike"),
    wideOnly: true,
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
