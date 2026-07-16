<template>
  <div class="flex flex-col gap-3">
    <div
      class="flex items-center justify-between text-xs text-muted-foreground"
    >
      <span>{{ t("chapters.count", { count: chapters.length }) }}</span>
      <span
        v-if="totalDuration"
        class="tabular-nums"
      >
        {{ formatDuration(totalDuration) }}
      </span>
    </div>

    <textarea
      ref="textareaRef"
      :value="textValue"
      :aria-label="t('chapters.editorPlaceholder')"
      class="min-h-[200px] w-full resize-y rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm leading-relaxed tabular-nums transition-[border-color,box-shadow] duration-200 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] placeholder:text-muted-foreground"
      :placeholder="t('chapters.editorPlaceholder')"
      @input="onInput"
      @keydown.tab.prevent="onTab"
    />

    <div
      v-if="parseError"
      class="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
    >
      {{ parseError }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { formatDuration } from "@/lib/format/time";

export interface DraftChapter {
  id: string;
  time: number;
  title: string;
}

const props = defineProps<{
  modelValue: DraftChapter[];
  duration: number;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", chapters: DraftChapter[]): void;
}>();

const { t } = useI18n();

const textareaRef = ref<HTMLTextAreaElement>();
const parseError = ref<string | null>(null);
const textValue = ref(chaptersToText(props.modelValue));
const internalUpdate = ref(false);

function chaptersToText(chapters: DraftChapter[]): string {
  return chapters
    .map((c) => {
      const m = Math.floor(c.time / 60);
      const s = Math.round(c.time % 60);
      const time = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      return `${time} - ${c.title || t("chapters.untitled")}`;
    })
    .join("\n");
}

watch(() => props.modelValue, (val) => {
  if (internalUpdate.value) {
    internalUpdate.value = false;
    return;
  }
  const current = chaptersToText(val);
  if (current !== textValue.value) {
    textValue.value = current;
  }
}, { deep: true });

const linePattern = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\s*[-–]\s*|\s+)(.+)$/;

function parseLine(line: string): { time: number; title: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match = trimmed.match(linePattern);
  if (!match) return null;

  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const title = match[4].trim();

  const time = hours * 3600 + minutes * 60 + seconds;
  if (time > props.duration) return null;

  return { time, title };
}

watch(textValue, () => {
  const lines = textValue.value.split("\n");
  parseError.value = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.match(linePattern)) {
      parseError.value = `Не удалось распознать строку: "${trimmed}"`;
      break;
    }
  }
});

const parsed = computed(() => {
  const lines = textValue.value.split("\n");
  const result: { time: number; title: string }[] = [];

  for (const line of lines) {
    const entry = parseLine(line);
    if (entry) {
      result.push(entry);
    }
  }

  return result.sort((a, b) => a.time - b.time);
});

const chapters = computed(() =>
  parsed.value.map((c) => ({ id: crypto.randomUUID(), time: c.time, title: c.title })),
);

const totalDuration = computed(() => {
  if (parsed.value.length === 0) return 0;
  return parsed.value[parsed.value.length - 1].time;
});

function syncParent(): void {
  internalUpdate.value = true;
  emit("update:modelValue", chapters.value);
}

function onInput(e: Event): void {
  textValue.value = (e.target as HTMLTextAreaElement).value;
  syncParent();
}

function onTab(): void {
  const ta = textareaRef.value;
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  textValue.value = textValue.value.slice(0, start) + "  " + textValue.value.slice(end);
  syncParent();
  requestAnimationFrame(() => {
    ta.selectionStart = ta.selectionEnd = start + 2;
  });
}
</script>
