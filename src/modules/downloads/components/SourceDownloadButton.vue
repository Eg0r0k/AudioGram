<template>
  <!-- A finished copy renders no button: the check next to the title
       (TrackExpanded) is the downloaded indicator. -->
  <Button
    v-if="!hasCopy"
    size="icon-sm"
    variant="ghost"
    class="shrink-0 rounded-full text-muted-foreground hover:text-foreground transition-opacity"
    :class="[
      // Idle fades in on row hover like the like/dots actions; an active
      // download stays visible.
      activeJob ? '' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
    ]"
    :disabled="!!activeJob"
    :aria-label="label"
    :title="label"
    @click.stop="download"
  >
    <IconLoader
      v-if="activeJob"
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
import type { SourceTrackDTO } from "@/modules/sources/types";
import { offlineCopyQueries } from "@/queries/offlineCopy.queries";
import { downloadSubject } from "../enqueue";
import { useDownloadsStore } from "../store/downloads.store";
import IconDownload from "~icons/tabler/download";
import IconLoader from "~icons/tabler/loader-2";

//
// Row action for any remote catalog row (ND, YT — M5): jobs go through the
// shared download manager (pin → queue → offline copy).
//

const props = defineProps<{
  /** Source DTO of the remote row. */
  dto: SourceTrackDTO;
}>();

const { t } = useI18n();
const downloadsStore = useDownloadsStore();

const activeJob = computed(() => downloadsStore.byTrackId[props.dto.id]);

const { data: offlineCopy } = useQuery(computed(() => offlineCopyQueries.detail(props.dto.id)));
const hasCopy = computed(() => !!offlineCopy.value);

const label = computed(() => {
  const job = activeJob.value;
  if (job) {
    return job.status === "running" && job.total
      ? `${Math.min(100, Math.round((job.downloaded / job.total) * 100))}%`
      : t("downloads.downloading");
  }
  return t("track.contextMenu.download");
});

async function download(): Promise<void> {
  if (activeJob.value || hasCopy.value) return;
  try {
    await downloadSubject({ kind: "remote", dto: props.dto });
  }
  catch {
    toast.error(t("track.downloadFailed"));
  }
}
</script>
