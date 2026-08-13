<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="flex flex-col max-h-[80vh] sm:max-w-lg gap-0 p-0 overflow-hidden">
      <div class="border-b px-6 py-5 shrink-0">
        <DialogHeader class="gap-2 pr-10">
          <DialogTitle>{{ $t("youtube.import.dialogTitle") }}</DialogTitle>
          <DialogDescription>{{ title }}</DialogDescription>
        </DialogHeader>
      </div>

      <div class="px-6 py-4 shrink-0 flex flex-col gap-3">
        <div class="flex flex-col gap-1.5 text-sm font-medium">
          <span>{{ $t("youtube.import.playlistName") }}</span>
          <Input
            v-model="playlistName"
            :aria-label="$t('youtube.import.playlistName')"
            :maxlength="100"
          />
        </div>

        <button
          type="button"
          class="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-fit"
          @click="toggleAll"
        >
          <Checkbox
            :model-value="allSelected"
            tabindex="-1"
          />
          {{ $t("youtube.import.selectAll") }}
        </button>
      </div>

      <Scrollable class="flex-1 min-h-0 border-t">
        <ul class="flex flex-col px-4 py-2">
          <li
            v-for="track in tracks"
            :key="track.id"
          >
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/60"
              @click="toggle(track.id)"
            >
              <Checkbox
                :model-value="selected.has(track.id)"
                tabindex="-1"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm">
                  {{ track.title }}
                </p>
                <p
                  v-if="track.artist"
                  class="truncate text-xs text-muted-foreground"
                >
                  {{ track.artist }}
                </p>
              </div>
            </button>
          </li>
        </ul>
      </Scrollable>

      <div class="border-t px-6 py-4 shrink-0 flex justify-end gap-2">
        <Button
          variant="ghost"
          class="rounded-full"
          @click="emit('update:open', false)"
        >
          {{ $t("common.cancel") }}
        </Button>
        <Button
          class="rounded-full"
          :disabled="selected.size === 0 || !playlistName.trim()"
          @click="confirm"
        >
          {{ $t("youtube.import.start") }} ({{ selected.size }})
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DialogContent from "@/components/ui/dialog/DialogContent.vue";
import { Input } from "@/components/ui/input";
import { Scrollable } from "@/components/ui/scrollable";
import type { YtPlayable } from "../../types";

const props = defineProps<{
  open: boolean;
  title: string;
  tracks: YtPlayable[];
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  "confirm": [name: string, tracks: YtPlayable[]];
}>();

const playlistName = ref("");
const selected = ref(new Set<string>());

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    playlistName.value = props.title;
    selected.value = new Set(props.tracks.map(track => track.id));
  },
);

const allSelected = computed(() => selected.value.size === props.tracks.length);

function toggle(id: string) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

function toggleAll() {
  selected.value = allSelected.value
    ? new Set()
    : new Set(props.tracks.map(track => track.id));
}

function confirm() {
  const chosen = props.tracks.filter(track => selected.value.has(track.id));
  emit("confirm", playlistName.value.trim(), chosen);
  emit("update:open", false);
}
</script>
