<template>
  <!-- A downloaded track renders no button at all: the persistent check next
       to the title already says it, a hover-in check would only repeat it. -->
  <Button
    v-if="status !== 'done'"
    :size="iconOnly ? 'icon-sm' : 'sm'"
    :variant="iconOnly ? 'ghost' : 'ghost-primary'"
    class="shrink-0 rounded-full"
    :class="[
      iconOnly ? 'text-muted-foreground hover:text-foreground transition-opacity' : '',
      // Idle icon buttons fade in on row hover like the like/dots actions
      // (the button must not cover the duration); progress/error stay visible.
      iconOnly && !status
        ? 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100'
        : '',
    ]"
    :disabled="isBusy"
    :aria-label="label"
    :title="label"
    @click.stop="download(item)"
  >
    <IconAlert
      v-if="status === 'error'"
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
    case "error":
      return t("youtube.failed");
    default:
      return t("youtube.download");
  }
});
</script>
