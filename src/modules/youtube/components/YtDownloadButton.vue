<template>
  <Button
    :size="iconOnly ? 'icon-sm' : 'sm'"
    :variant="iconOnly ? 'ghost' : 'ghost-primary'"
    class="shrink-0 rounded-full"
    :class="[
      iconOnly ? 'text-muted-foreground hover:text-foreground transition-opacity' : '',
      // Idle and done icon buttons fade in on row hover like the like/dots
      // actions (done is also shown as a check next to the title, so the
      // button must not cover the duration); progress/error stay visible.
      iconOnly && (!status || status === 'done')
        ? 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100'
        : '',
    ]"
    :disabled="isBusy"
    :aria-label="label"
    :title="label"
    @click.stop="download(item)"
  >
    <IconCheck
      v-if="status === 'done'"
      class="size-4.5 text-green-500"
    />
    <IconAlert
      v-else-if="status === 'error'"
      class="size-4.5 text-destructive"
    />
    <IconLoader
      v-else-if="isBusy"
      class="size-4.5 animate-spin"
    />
    <IconDownload
      v-else
      class="size-4.5"
    />
    <span
      v-if="!compact && !iconOnly"
      class="ml-1 text-xs"
    >{{ label }}</span>
  </Button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { useYoutube } from "../composables/useYoutube";
import type { YtPlayable } from "../types";
import IconDownload from "~icons/tabler/download";
import IconCheck from "~icons/tabler/check";
import IconAlert from "~icons/tabler/alert-triangle";
import IconLoader from "~icons/tabler/loader-2";

const props = defineProps<{
  item: YtPlayable;
  compact?: boolean;
  /** Round ghost icon button matching TrackExpanded row actions. */
  iconOnly?: boolean;
}>();

const { t } = useI18n();
const { store, download } = useYoutube();

const state = computed(() => store.downloads[props.item.id]);
const status = computed(() => state.value?.status ?? null);
const isBusy = computed(() =>
  status.value === "downloading" || status.value === "processing" || status.value === "importing",
);

const label = computed(() => {
  switch (state.value?.status) {
    case "downloading":
      return state.value.percent === null
        ? t("youtube.downloading")
        : `${state.value.percent}%`;
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
});
</script>
