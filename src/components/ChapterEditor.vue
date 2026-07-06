<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-3">
      <div
        v-for="chapter in sortedChapters"
        :key="chapter.id"
        class="flex items-center gap-2"
      >
        <Input
          label="Время"
          surface="card"
          class="font-mono"
          :model-value="formatDuration(chapter.time)"
          @change="onTimeChange(chapter.id, $event)"
        />
        <Input
          surface="card"
          class="flex-1"
          :model-value="chapter.title"
          label="Название главы"
          @update:model-value="(val) => onTitleChange(chapter.id, val as string)"
        />
        <Button
          size="icon-sm"
          variant="destructive-link"
          @click="removeChapter(chapter.id)"
        >
          <IconTrash class="size-5" />
        </Button>
      </div>

      <p
        v-if="sortedChapters.length === 0"
        class="py-6 text-center text-sm text-muted-foreground"
      >
        Таймкодов пока нет — добавь метку выше или импортируй .cue
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import IconTrash from "~icons/tabler/trash";
import { formatDuration, parseTimeToSeconds } from "@/lib/format/time";

export interface DraftChapter {
  id: string;
  time: number;
  title: string;
}

const props = defineProps<{
  modelValue: DraftChapter[];
  duration: number;
  currentTime: number;
}>();

const emit = defineEmits<{
  "update:modelValue": [chapters: DraftChapter[]];
  "seek": [time: number];
}>();

const sortedChapters = computed(() => [...props.modelValue].sort((a, b) => a.time - b.time));

const previewChapters = computed(() =>
  sortedChapters.value.map(c => ({ time: c.time, title: c.title || undefined })),
);

function addAtCurrentTime(): void {
  const next: DraftChapter = {
    id: crypto.randomUUID(),
    time: Math.round(props.currentTime * 10) / 10,
    title: "",
  };
  emit("update:modelValue", [...props.modelValue, next]);
}

function removeChapter(id: string): void {
  emit("update:modelValue", props.modelValue.filter(c => c.id !== id));
}

function onTitleChange(id: string, value: string): void {
  emit("update:modelValue", props.modelValue.map(c => (c.id === id ? { ...c, title: value } : c)));
}

function onTimeChange(id: string, event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  const seconds = parseTimeToSeconds(raw);
  if (seconds === null) return;
  const clamped = Math.min(Math.max(seconds, 0), props.duration);
  emit("update:modelValue", props.modelValue.map(c => (c.id === id ? { ...c, time: clamped } : c)));
}
</script>
