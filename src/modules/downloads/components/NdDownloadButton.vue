<template>
  <Button
    size="icon-sm"
    variant="ghost"
    class="shrink-0 rounded-full text-muted-foreground hover:text-foreground transition-opacity"
    :class="[
      // Idle and done fade in on row hover like the like/dots actions;
      // an active download stays visible.
      activeJob ? '' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
    ]"
    :disabled="!!activeJob || hasCopy"
    :aria-label="label"
    :title="label"
    @click.stop="download"
  >
    <IconCheck
      v-if="hasCopy"
      class="size-4.5 text-green-500"
    />
    <IconLoader
      v-else-if="activeJob"
      class="size-4.5 animate-spin"
    />
    <IconDownload
      v-else
      class="size-4.5"
    />
  </Button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useQuery } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import type { Track } from "@/modules/player/types";
import { offlineCopyQueries } from "@/queries/offlineCopy.queries";
import { downloadSubject } from "../enqueue";
import { useDownloadsStore } from "../store/downloads.store";
import IconCheck from "~icons/tabler/check";
import IconDownload from "~icons/tabler/download";
import IconLoader from "~icons/tabler/loader-2";

//
// The ND counterpart of YtDownloadButton's row action — same pattern, own
// mechanism: jobs go through the download manager (pin → queue → offline
// copy), not through yt-dlp. Rendered on catalog rows (sourceDto) where the
// like button has no library row to write to.
//

const props = defineProps<{
  /** Display VM of an ND catalog row — carries its DTO. */
  track: Track;
}>();

const { t } = useI18n();
const downloadsStore = useDownloadsStore();

const activeJob = computed(() => downloadsStore.byTrackId[props.track.id]);

const { data: offlineCopy } = useQuery(computed(() => offlineCopyQueries.detail(props.track.id)));
const hasCopy = computed(() => !!offlineCopy.value);

const label = computed(() => {
  if (hasCopy.value) return t("youtube.done");
  const job = activeJob.value;
  if (job) {
    return job.status === "running" && job.total
      ? `${Math.min(100, Math.round((job.downloaded / job.total) * 100))}%`
      : t("youtube.downloading");
  }
  return t("track.contextMenu.download");
});

async function download(): Promise<void> {
  const dto = props.track.sourceDto;
  if (!dto || activeJob.value || hasCopy.value) return;
  try {
    await downloadSubject({ kind: "remote", dto });
  }
  catch {
    toast.error(t("track.downloadFailed"));
  }
}
</script>
