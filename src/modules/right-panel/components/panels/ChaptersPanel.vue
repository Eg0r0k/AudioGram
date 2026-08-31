<template>
  <div class="flex h-full min-h-0 flex-col bg-card">
    <RightPanelHeader
      class="bg-card"
      :show-close="true"
      :show-back="rightPanel.depth > 0 && !isEditing"
      :title="t('chapters.inThisTrack')"
      @close="rightPanel.close()"
      @back="rightPanel.back()"
    >
      <template #trailing>
        <template v-if="isEditing">
          <Button
            variant="ghost"
            size="icon"
            class="shrink-0 rounded-full"
            :aria-label="t('chapters.cancelEdit')"
            :disabled="isSaving"
            @click="cancelEditing()"
          >
            <IconX class="size-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            class="shrink-0 rounded-full"
            :aria-label="t('chapters.save')"
            :disabled="!isFormValid || isSaving"
            @click="handleSave()"
          >
            <IconCheck class="size-6 text-primary" />
          </Button>
        </template>

        <template v-else>
          <Button
            variant="ghost"
            size="icon"
            class="shrink-0 rounded-full"
            :aria-label="t('chapters.importCue')"
            :disabled="isImporting"
            @click="openCueDialog()"
          >
            <IconUpload
              class="size-6"
              :class="{ 'animate-pulse': isImporting }"
            />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            class="shrink-0 rounded-full"
            :aria-label="t('chapters.edit')"
            @click="isEditing = true"
          >
            <IconPencil class="size-6" />
          </Button>
        </template>
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
        class="px-4 py-3"
      />

      <div
        v-else
        class="flex flex-col"
      >
        <Empty
          v-if="chapters.length === 0"
          class="p-4 py-8 md:p-4 md:py-8"
        >
          <EmptyHeader>
            <EmptyMedia
              variant="icon"
              class="rounded-full text-muted-foreground"
            >
              <IconBookmarkOff class="size-5" />
            </EmptyMedia>
            <EmptyDescription>{{ t("chapters.empty") }}</EmptyDescription>
          </EmptyHeader>
        </Empty>

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

          <ItemActions class="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity ml-2 shrink-0">
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
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
import IconBookmarkOff from "~icons/tabler/bookmark-off";
import IconCheck from "~icons/tabler/check";
import IconPencil from "~icons/tabler/pencil";
import IconUpload from "~icons/tabler/upload";
import IconX from "~icons/tabler/x";
import IconPlay from "~icons/audiogram/play-rounded";
import IconTrash from "~icons/tabler/trash";
import { parseCueSheet } from "@/lib/cue/parseCueSheet";
import { formatDuration } from "@/lib/format/time";
import { object, number, string, pipe, minValue, maxValue, safeParse } from "valibot";
import { usePlayerStore } from "@/modules/player";
import { useSaveTrackChapters, useTrackChapters } from "@/modules/tracks/composables/useTrackChapters";
import type { Track } from "@/modules/player/types";
import type { TrackChapterMark } from "@/db/entities";
import type { DraftChapter } from "@/components/ChapterEditor.vue";
import ChapterEditor from "@/components/ChapterEditor.vue";
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
const isSaving = saveMutation.isPending;
const isImporting = ref(false);
const importError = ref<string | null>(null);
// The list as it was when editing started — what "cancel" puts back, since
// the autosave below may already have written the draft.
let editSnapshot: TrackChapterMark[] = [];

const chapterSchema = object({
  time: pipe(number(), minValue(0), maxValue(props.track.duration)),
  title: string(),
});

const isFormValid = computed(() =>
  draft.value.every(ch => safeParse(chapterSchema, { time: ch.time, title: ch.title }).success),
);

const toPayload = (list: DraftChapter[]): TrackChapterMark[] => [...list]
  .sort((a, b) => a.time - b.time)
  .map(c => ({ time: c.time, title: c.title.trim() || undefined }));

const sameChapters = (a: TrackChapterMark[], b: TrackChapterMark[]): boolean =>
  a.length === b.length
  && a.every((c, i) => c.time === b[i].time && (c.title ?? "") === (b[i].title ?? ""));

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

const clearAutoSave = (): void => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = null;
};

watch(isEditing, (editing) => {
  if (!editing) return;
  editSnapshot = chapters.value.map(c => ({ time: c.time, title: c.title }));
  draft.value = chapters.value.map(c => ({ id: crypto.randomUUID(), time: c.time, title: c.title ?? "" }));
});

watch(draft, () => {
  if (!isEditing.value) return;
  clearAutoSave();
  autoSaveTimer = setTimeout(() => {
    saveMutation.mutate({ trackId: props.track.id, chapters: toPayload(draft.value) });
  }, 1500);
}, { deep: true });

watch(trackId, () => {
  clearAutoSave();
  isEditing.value = false;
  importError.value = null;
});

const { open: openCueDialog, onChange } = useFileDialog({ accept: ".cue", multiple: false });

const importCueFile = async (file: File) => {
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
};

// importCueFile handles every failure internally (importError + finally),
// so there is nothing left for this rejection path to report.
onChange((files) => {
  const file = files?.[0];
  if (!file) return;
  importCueFile(file).catch(() => {});
});

function handleSeek(time: number): void {
  player.seekTo(time);
}

async function removeSavedChapter(index: number): Promise<void> {
  const next = chapters.value.filter((_, i) => i !== index);
  await saveMutation.mutateAsync({ trackId: props.track.id, chapters: next });
}

async function handleSave(): Promise<void> {
  clearAutoSave();
  const payload = toPayload(draft.value);
  if (!sameChapters(payload, chapters.value)) {
    await saveMutation.mutateAsync({ trackId: props.track.id, chapters: payload });
  }
  isEditing.value = false;
}

async function cancelEditing(): Promise<void> {
  clearAutoSave();
  isEditing.value = false;
  if (!sameChapters(chapters.value, editSnapshot)) {
    await saveMutation.mutateAsync({ trackId: props.track.id, chapters: editSnapshot });
  }
}
</script>
