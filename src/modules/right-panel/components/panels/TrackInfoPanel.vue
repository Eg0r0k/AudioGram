<template>
  <div class="flex h-full flex-col bg-card">
    <RightPanelHeader
      :title="$t('track.details.title')"
      :description="track.title"
      :show-back="rightPanel.depth > 0"
      @back="handleBack"
      @close="rightPanel.close()"
    >
      <template #trailing>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              size="icon"
              class="rounded-full"
              variant="ghost"
            >
              <IconDots class="size-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="left"
            align="start"
          >
            <DropdownMenuItem
              v-if="libraryTrack"
              @click="openEdit"
            >
              <IconPencil class="size-5" />
              {{ $t('common.edit') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="libraryTrack"
              variant="destructive"

              @click="handleDelete"
            >
              <TrashIcon class="size-5" />
              {{ $t('common.delete') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </RightPanelHeader>

    <Scrollable class="min-h-0 flex-1">
      <div class="grid gap-6 bg-canvas">
        <section class="grid gap-3 p-2 bg-card">
          <div class="grid gap-3 sm:grid-cols-1">
            <DetailField
              :title="$t('track.details.fields.title')"
              :value="track.title"
              @click="openEdit"
            >
              <template #icon>
                <IconMusic class="size-6" />
              </template>
            </DetailField>
            <DetailField
              :title="$t('track.details.fields.artist')"
              :value="track.artist"
              @click="openEdit"
            >
              <template #icon>
                <IconMicrophone2 class="size-6" />
              </template>
            </DetailField>
            <DetailField
              :title="$t('track.details.fields.album')"
              :value="track.albumName"
              @click="openEdit"
            >
              <template #icon>
                <IconDisc class="size-6" />
              </template>
            </DetailField>
            <DetailField
              :title="$t('track.details.fields.duration')"
              :value="formattedDuration"
            >
              <template #icon>
                <IconClockHour4 class="size-6" />
              </template>
            </DetailField>
            <DetailField
              :title="$t('track.details.fields.source')"
              :value="sourceLabel"
            >
              <template #icon>
                <IconWorld class="size-6" />
              </template>
            </DetailField>
            <DetailField
              v-if="isLibraryTrack(track)"
              :title="$t('track.details.fields.storagePath')"
              :value="storagePathValue"
              class="sm:col-span-2"
            >
              <template #icon>
                <IconFolder class="size-6" />
              </template>
            </DetailField>
          </div>
        </section>
        <section
          v-if="isLibraryTrack(track)"
          class="grid gap-3 p-2 bg-card"
        >
          <div class="grid gap-3 sm:grid-cols-1">
            <DetailField
              :title="$t('track.details.fields.codec')"
              :value="effectiveFormat.codec"
            >
              <template #icon>
                <IconFileMusic class="size-6" />
              </template>
            </DetailField>

            <DetailField
              :title="$t('track.details.fields.bitrate')"
              :value="formattedBitrate"
            >
              <template #icon>
                <IconWaveSine class="size-6" />
              </template>
            </DetailField>

            <DetailField
              :title="$t('track.details.fields.sampleRate')"
              :value="formattedSampleRate"
            >
              <template #icon>
                <IconActivityHeartbeat class="size-6" />
              </template>
            </DetailField>

            <DetailField
              :title="$t('track.details.fields.channels')"
              :value="effectiveFormat.channels"
            >
              <template #icon>
                <IconCirclesRelation class="size-6" />
              </template>
            </DetailField>

            <DetailField
              :title="$t('track.details.fields.lossless')"
              :value="losslessLabel"
            >
              <template #icon>
                <IconShieldCheck class="size-6" />
              </template>
            </DetailField>
          </div>
        </section>
        <section
          v-if="isLibraryTrack(track)"
          class="grid gap-3 p-2 bg-card"
        >
          <div class="grid gap-3 sm:grid-cols-1">
            <DetailField
              :title="$t('track.details.fields.trackId')"
              :value="track.id"
            >
              <template #icon>
                <IconFingerprint class="size-6" />
              </template>
            </DetailField>
            <DetailField
              :title="$t('track.details.fields.albumId')"
              :value="track.albumId"
            >
              <template #icon>
                <IconDisc class="size-6" />
              </template>
            </DetailField>
            <DetailField
              :title="$t('track.details.fields.artistIds')"
              :value="track.artistIds.join(', ')"
              class="sm:col-span-2"
            >
              <template #icon>
                <IconUsers class="size-6" />
              </template>
            </DetailField>
            <DetailField
              :title="$t('track.details.fields.state')"
              :value="stateLabel"
            >
              <template #icon>
                <IconCircleCheck class="size-6" />
              </template>
            </DetailField>

            <DetailField
              :title="$t('track.details.fields.lyricsPath')"
              :value="entity?.lyricsPath"
            >
              <template #icon>
                <IconFileText class="size-6" />
              </template>
            </DetailField>
          </div>

          <Button
            class="w-full h-14 justify-start  "
            size="xl"
            variant="destructive-link"
            @click="handleDelete"
          >
            <TrashIcon class="size-6" />
            {{ $t('common.delete') }}
          </Button>
        </section>
      </div>
    </Scrollable>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { skipToken, useQuery } from "@tanstack/vue-query";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { TrackSource, TrackState } from "@/db/entities";
import { Button } from "@/components/ui/button";
import Scrollable from "@/components/ui/scrollable/Scrollable.vue";
import { formatDuration } from "@/lib/format/time";
import { getLogger } from "@/lib/logger";
import { getTrackEntityById } from "@/queries/track.queries";
import { useTrackDeletion } from "@/modules/tracks/composables/useTrackDeletion";
import DeleteTrackDialog, { type DeleteTrackConfirmation } from "@/components/dialogs/DeleteTrackDialog.vue";
import { summonDialog } from "@/components/dialogs/summon";
import { useGeneralSettings } from "@/modules/settings/store/general";
import { offlineCopyQueries } from "@/queries/offlineCopy.queries";
import { queryKeys } from "@/queries/query-keys";
import { isLibraryTrack, type Track } from "@/modules/player/types";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import type { RightPanelTrackInfoPayload } from "@/modules/right-panel/types";
import DetailField from "@/modules/tracks/components/TrackDetailsField.vue";
import RightPanelHeader from "../RightPanelHeader.vue";
import IconCircleCheck from "~icons/tabler/circle-check";
import IconActivityHeartbeat from "~icons/tabler/activity-heartbeat";
import IconClockHour4 from "~icons/tabler/clock-hour-4";
import IconCirclesRelation from "~icons/tabler/circles-relation";
import IconDisc from "~icons/tabler/disc";
import IconFileMusic from "~icons/tabler/file-music";
import IconFileText from "~icons/tabler/file-text";
import IconFingerprint from "~icons/tabler/fingerprint";
import IconFolder from "~icons/tabler/folder";
import IconMicrophone2 from "~icons/tabler/microphone-2";
import IconMusic from "~icons/tabler/music";
import IconPencil from "~icons/tabler/pencil";
import IconDots from "~icons/tabler/dots";
import IconShieldCheck from "~icons/tabler/shield-check";
import TrashIcon from "~icons/tabler/trash";
import IconUsers from "~icons/tabler/users";
import IconWaveSine from "~icons/tabler/wave-sine";
import IconWorld from "~icons/tabler/world";
import DropdownMenu from "@/components/ui/dropdown-menu/DropdownMenu.vue";
import DropdownMenuTrigger from "@/components/ui/dropdown-menu/DropdownMenuTrigger.vue";
import DropdownMenuContent from "@/components/ui/dropdown-menu/DropdownMenuContent.vue";
import DropdownMenuItem from "@/components/ui/dropdown-menu/DropdownMenuItem.vue";
const props = defineProps<{
  payload: RightPanelTrackInfoPayload;
}>();

const { t } = useI18n();
const rightPanel = useRightPanelStore();

const track = computed(() => props.payload.track);
const libraryTrack = computed<Track | null>(() => isLibraryTrack(track.value) ? track.value : null);

const { data: entity } = useQuery({
  queryKey: computed(() =>
    libraryTrack.value ? queryKeys.tracks.detail(libraryTrack.value.id) : ["tracks", "detail", "none"]),
  queryFn: computed(() => {
    const id = libraryTrack.value?.id;
    return id ? () => getTrackEntityById(id) : skipToken;
  }),
});

// У remote-треков (YT/ND) storagePath в строке трека пуст by design — путь
// и формат скачанного файла живут в offlineCopies.
const isRemoteLibraryTrack = computed(() => {
  const source = libraryTrack.value?.source;
  return source === TrackSource.REMOTE_YT || source === TrackSource.REMOTE_SUBSONIC;
});

const { data: offlineCopy } = useQuery(computed(() =>
  offlineCopyQueries.detail(isRemoteLibraryTrack.value ? libraryTrack.value!.id : null),
));

const storagePathValue = computed(() =>
  libraryTrack.value?.storagePath || offlineCopy.value?.storagePath || "—",
);

const { deleteWithUndo } = useTrackDeletion();
const isDeleting = ref(false);

const formattedDuration = computed(() => {
  if (isLibraryTrack(track.value)) {
    return formatDuration(track.value.duration);
  }

  return track.value.duration ? formatDuration(track.value.duration) : "—";
});

function openEdit() {
  if (!libraryTrack.value) return;
  rightPanel.openEditTrack({ track: libraryTrack.value });
}

const sourceLabel = computed(() => {
  if (!isLibraryTrack(track.value)) {
    return track.value.source.type;
  }

  switch (track.value.source) {
    case TrackSource.LOCAL_INTERNAL:
      return t("track.details.values.localInternal");
    case TrackSource.LOCAL_EXTERNAL:
      return t("track.details.values.localExternal");
    case TrackSource.REMOTE_HLS:
      return t("track.details.values.remoteHls");
    case TrackSource.REMOTE_YT:
      return t("track.details.values.remoteYt");
    case TrackSource.REMOTE_SUBSONIC:
      return t("track.details.values.remoteNd");
    default:
      return "—";
  }
});

const stateLabel = computed(() => {
  if (!isLibraryTrack(track.value)) return "—";

  switch (track.value.state) {
    case TrackState.READY:
      return t("track.details.values.ready");
    case TrackState.BROKEN:
      return t("track.details.values.broken");
    default:
      return "—";
  }
});

// Формат по строке трека, с фолбэком на скачанную копию (у YT/ND-строк
// собственный format пуст, реальный лежит рядом с файлом в offlineCopies).
const effectiveFormat = computed(() => {
  const entityFormat = entity.value?.format;
  const copyFormat = offlineCopy.value?.format;
  return {
    codec: entityFormat?.codec ?? copyFormat?.codec,
    bitrate: entityFormat?.bitrate ?? copyFormat?.bitrate,
    sampleRate: entityFormat?.sampleRate ?? copyFormat?.sampleRate,
    channels: entityFormat?.channels ?? copyFormat?.channels,
    lossless: entityFormat?.lossless ?? copyFormat?.lossless,
  };
});

const formattedBitrate = computed(() => {
  const bitrate = effectiveFormat.value.bitrate;
  if (!bitrate) return "—";
  return `${Math.round(bitrate / 1000)} kbps`;
});

const formattedSampleRate = computed(() => {
  const sampleRate = effectiveFormat.value.sampleRate;
  if (!sampleRate) return "—";
  return `${(sampleRate / 1000).toFixed(1)} kHz`;
});

const losslessLabel = computed(() => {
  const lossless = effectiveFormat.value.lossless;
  if (lossless === undefined) return "—";
  return lossless ? t("common.yes") : t("common.no");
});

function handleBack(): void {
  rightPanel.back();
}

const { confirmTrackDeletion, setConfirmTrackDeletion } = useGeneralSettings();

async function handleDelete(): Promise<void> {
  if (!libraryTrack.value || isDeleting.value) return;

  if (confirmTrackDeletion.value) {
    const confirmation = await summonDialog<DeleteTrackConfirmation>(
      DeleteTrackDialog,
      { trackTitle: libraryTrack.value.title },
      { key: `delete-track:${libraryTrack.value.id}` },
    );
    if (!confirmation) return;
    if (confirmation.dontAskAgain) setConfirmTrackDeletion(false);
  }

  await performDelete();
}

async function performDelete(): Promise<void> {
  if (!libraryTrack.value || isDeleting.value) return;

  isDeleting.value = true;
  try {
    const deleted = await deleteWithUndo([libraryTrack.value.id], () => t("track.deleted"));
    if (deleted === 0) throw new Error("Track not found");
    rightPanel.close();
  }
  catch (error) {
    getLogger().error(`[TrackInfoPanel] Deleting the track failed: ${String(error)}`);
    toast.error(t("track.deleteFailed"));
  }
  finally {
    isDeleting.value = false;
  }
}
</script>
