<template>
  <div class="flex h-full min-h-0 flex-col bg-card">
    <RightPanelHeader
      class="bg-card"
      :show-close="true"
      :show-back="rightPanel.depth > 0 && !isEditing"
      :title="'В этом треке'"
      @close="rightPanel.close()"
      @back="rightPanel.back()"
    >
      <template #trailing>
        <Button
          v-if="!isEditing"
          variant="ghost"
          size="icon"
          class="shrink-0 rounded-full"
          :disabled="isImporting"
          @click="openCueDialog()"
        >
          <IconUpload
            v-if="isImporting"
            class="size-6 animate-pulse"
          />
          <IconUpload
            v-else
            class="size-6"
          />
        </Button>

        <Button
          v-if="isEditing"
          variant="ghost"
          size="icon"
          class="shrink-0 rounded-full"
          :disabled="!isFormValid"
          @click="handleSave()"
        >
          <IconCheck
            class="size-6 text-primary"
          />
        </Button>

        <Button
          v-else
          variant="ghost"
          size="icon"
          class="shrink-0 rounded-full"
          @click="isEditing = true"
        >
          <IconPencil class="size-6" />
        </Button>
      </template>
    </RightPanelHeader>

    <p
      v-if="importError"
      class="px-4 py-2 text-sm text-destructive bg-destructive/10 border-b border-destructive/20 animate-in fade-in duration-200"
    >
      {{ importError }}
    </p>

    <Scrollable class="flex-1">
      <ChapterEditor
        v-if="isEditing"
        v-model="draft"
        :duration="track.duration"
        :current-time="player.currentTime"
        class="px-4 py-3"
        @seek="handleSeek"
      />

      <div
        v-else
        class="flex flex-col"
      >
        <p
          v-if="chapters.length === 0"
          class="px-4 py-8 text-center text-sm text-muted-foreground"
        >
          {{ t("chapters.empty") }}
        </p>

        <Item
          v-for="(chapter, index) in chapters"
          :key="`${chapter.time}-${index}`"
          as="button"
          type="button"
          class="group text-left transition-colors hover:bg-muted/50 py-2 flex items-center justify-between"
          :class="{ 'bg-muted/50': activeChapterIndex === index }"
          @click="handleSeek(chapter.time)"
        >
          <div class="flex items-center gap-4 min-w-0 flex-1">
            <ItemMedia class="size-6 pl-2 text-sm text-muted-foreground flex items-center justify-center font-medium shrink-0">
              <IconPlay class="size-4 hidden group-hover:block text-foreground" />
              <span class="group-hover:hidden">{{ index + 1 }}</span>
            </ItemMedia>

            <div class="flex gap-2 items-center min-w-0">
              <Badge
                size="sm"
                class="shrink-0"
              >
                {{ formatDuration(chapter.time) }}
              </Badge>
              <ItemContent class="min-w-0">
                <ItemTitle class="truncate text-sm font-medium text-foreground">
                  {{ chapter.title || t("chapters.untitled") }}
                </ItemTitle>
              </ItemContent>
            </div>
          </div>

          <ItemActions class="opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
            <Button
              size="icon"
              variant="destructive-link"
              class="pointer-events-auto rounded-full"
              :aria-label="t('chapters.delete')"
              @click.stop="removeSavedChapter(index)"
            >
              <IconTrash class="size-5" />
            </Button>
          </ItemActions>
        </Item>
      </div>
    </Scrollable>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useFileDialog } from "@vueuse/core";
import { Button } from "@/components/ui/button";
import Scrollable from "@/components/ui/scrollable/Scrollable.vue";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import IconCheck from "~icons/tabler/check";
import IconPencil from "~icons/tabler/pencil";
import IconUpload from "~icons/tabler/upload";
import IconPlay from "~icons/audiogram/play-rounded";
import IconTrash from "~icons/tabler/trash";
import { parseCueSheet } from "@/lib/cue/parseCueSheet";
import { formatDuration } from "@/lib/format/time";
import { object, number, string, pipe, minValue, maxValue, safeParse } from "valibot";
import { usePlayerStore } from "@/modules/player";
import { useSaveTrackChapters, useTrackChapters } from "@/modules/tracks/composables/useTrackChapters";
import type { Track } from "@/modules/player/types";
import ChapterEditor, { DraftChapter } from "@/components/ChapterEditor.vue";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import RightPanelHeader from "@/modules/right-panel/components/RightPanelHeader.vue";
import Badge from "@/components/ui/badge/Badge.vue";

const rightPanel = useRightPanelStore();

const props = defineProps<{ track: Track }>();

const { t } = useI18n();
const player = usePlayerStore();

const trackId = computed(() => props.track.id);
const { data: savedChaptersData } = useTrackChapters(trackId);
const saveMutation = useSaveTrackChapters();

const chapters = computed(() => savedChaptersData.value ?? []);

const activeChapterIndex = computed(() => {
  const t = player.currentTime;
  const list = chapters.value;
  if (list.length === 0) return -1;

  for (let i = list.length - 1; i >= 0; i--) {
    if (t >= list[i].time) return i;
  }

  if (t < list[0].time) return -1;

  return -1;
});

const isEditing = ref(false);
const draft = ref<DraftChapter[]>([]);
const isImporting = ref(false);
const importError = ref<string | null>(null);

const chapterSchema = object({
  time: pipe(number(), minValue(0), maxValue(props.track.duration)),
  title: string(),
});

const isFormValid = computed(() => {
  if (draft.value.length === 0) return false;
  return draft.value.every((ch) => safeParse(chapterSchema, { time: ch.time, title: ch.title }).success);
});

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

watch(isEditing, (editing) => {
  if (!editing) return;
  draft.value = chapters.value.map(c => ({ id: crypto.randomUUID(), time: c.time, title: c.title ?? "" }));
});

watch(draft, () => {
  if (!isEditing.value) return;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    const payload = [...draft.value]
      .sort((a, b) => a.time - b.time)
      .map(c => ({ time: c.time, title: c.title.trim() || undefined }));
    saveMutation.mutate({ trackId: props.track.id, chapters: payload });
  }, 1500);
}, { deep: true });

watch(trackId, () => {
  isEditing.value = false;
  importError.value = null;
});

const { open: openCueDialog, onChange } = useFileDialog({ accept: ".cue", multiple: false });

onChange(async (files) => {
  const file = files?.[0];
  if (!file) return;

  isImporting.value = true;
  importError.value = null;
  try {
    const text = await file.text();
    const parsed = parseCueSheet(text);
    if (parsed.length === 0) {
      importError.value = t("chapters.cueParseEmpty");
      return;
    }

    const existingTimes = new Set(chapters.value.map(c => Math.round(c.time)));
    const merged = [
      ...chapters.value,
      ...parsed
        .filter(entry => !existingTimes.has(Math.round(entry.time)))
        .map(entry => ({ time: entry.time, title: entry.title })),
    ].sort((a, b) => a.time - b.time);

    await saveMutation.mutateAsync({ trackId: props.track.id, chapters: merged });
  }
  catch {
    importError.value = t("chapters.cueParseError");
  }
  finally {
    isImporting.value = false;
  }
});

function handleSeek(time: number): void {
  player.seekTo(time);
}

async function removeSavedChapter(index: number): Promise<void> {
  const next = chapters.value.filter((_, i) => i !== index);
  await saveMutation.mutateAsync({ trackId: props.track.id, chapters: next });
}

async function handleSave(): Promise<void> {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  const payload = [...draft.value]
    .sort((a, b) => a.time - b.time)
    .map(c => ({ time: c.time, title: c.title.trim() || undefined }));

  await saveMutation.mutateAsync({ trackId: props.track.id, chapters: payload });
  isEditing.value = false;
}
</script>
