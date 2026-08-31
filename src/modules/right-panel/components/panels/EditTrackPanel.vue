<template>
  <div
    class="relative flex h-full w-full flex-col overflow-hidden! bg-card"
    :style="keyboardInsetStyle"
  >
    <RightPanelHeader
      :title="$t('track.edit.title')"
      :description="track?.title"
      show-back
      @back="handleBack"
      @close="handleClose"
    />

    <Scrollable class="min-h-0 flex-1">
      <form
        v-if="track"
        class="grid gap-5 px-5 pb-[calc(6rem+var(--keyboard-inset,0px))] pt-2"
        @submit.prevent="onSubmit"
      >
        <div class="space-y-2">
          <Input
            id="track-title"
            v-model="titleInput"
            surface="card"
            :label="$t('track.edit.placeholders.title')"
            :disabled="isPending"
            :class="{ 'border-destructive focus-visible:ring-destructive': errors.title }"
            @keydown.enter.prevent="onSubmit"
          />

          <p
            v-if="errors.title"
            class="text-sm text-destructive"
          >
            {{ errors.title }}
          </p>
        </div>

        <div class="space-y-2 rounded-lg border border-border p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium">{{ $t('track.edit.fields.artists') }}</span>

            <Button
              type="button"
              variant="ghost-primary"
              size="sm"
              :aria-label="changeArtistsLabel"
              :disabled="isPending"
              @click="openArtistPicker"
            >
              {{ $t('common.change') }}
            </Button>
          </div>

          <div
            v-if="artistChips.length > 0"
            class="flex flex-wrap gap-1.5"
          >
            <Badge
              v-for="name in artistChips"
              :key="name"
              variant="secondary"
              class="max-w-full"
            >
              <span class="min-w-0 truncate">{{ name }}</span>
            </Badge>
          </div>

          <p
            v-else
            class="text-sm text-muted-foreground"
          >
            {{ $t('track.edit.noArtists') }}
          </p>

          <p
            v-if="artistsError"
            class="text-sm text-destructive"
          >
            {{ artistsError }}
          </p>
        </div>

        <div class="space-y-2 rounded-lg border border-border p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium">{{ $t('track.edit.fields.album') }}</span>

            <Button
              type="button"
              variant="ghost-primary"
              size="sm"
              :aria-label="changeAlbumLabel"
              :disabled="isPending"
              @click="openAlbumPicker"
            >
              {{ $t('common.change') }}
            </Button>
          </div>

          <div class="flex min-w-0 items-center gap-2 text-sm">
            <IconDisc class="size-4 shrink-0 text-muted-foreground" />

            <span
              v-if="albumLabel"
              class="min-w-0 truncate"
            >
              {{ albumLabel }}
            </span>

            <span
              v-else
              class="text-muted-foreground"
            >
              {{ $t('track.edit.noAlbum') }}
            </span>
          </div>

          <p
            v-if="newAlbumTitle"
            class="text-xs text-muted-foreground"
          >
            {{ $t('track.edit.newAlbumHint') }}
          </p>

          <p
            v-if="errors.albumLabel"
            class="text-sm text-destructive"
          >
            {{ errors.albumLabel }}
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-2">
            <Input
              id="track-number"
              v-model="trackNoInput"
              type="number"
              inputmode="numeric"
              surface="card"
              :label="$t('track.edit.fields.trackNo')"
              :disabled="isPending"
              :class="{ 'border-destructive focus-visible:ring-destructive': errors.trackNo }"
            />

            <p
              v-if="errors.trackNo"
              class="text-sm text-destructive"
            >
              {{ errors.trackNo }}
            </p>
          </div>

          <div class="space-y-2">
            <Input
              id="disk-number"
              v-model="diskNoInput"
              type="number"
              inputmode="numeric"
              surface="card"
              :label="$t('track.edit.fields.diskNo')"
              :disabled="isPending"
              :class="{ 'border-destructive focus-visible:ring-destructive': errors.diskNo }"
            />

            <p
              v-if="errors.diskNo"
              class="text-sm text-destructive"
            >
              {{ errors.diskNo }}
            </p>
          </div>
        </div>
      </form>

      <Empty
        v-else
        class="p-6 py-12 md:p-6 md:py-12"
      >
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            class="rounded-full text-muted-foreground"
          >
            <IconPencilOff class="size-5" />
          </EmptyMedia>
          <EmptyDescription>{{ $t('track.edit.libraryOnly') }}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Scrollable>

    <FloatingActionButton :show="hasChanges">
      <Button
        type="button"
        class="size-12 rounded-full shadow-lg"
        :disabled="!track || isPending || !meta.valid || !hasChanges"
        @click="onSubmit"
      >
        <IconSave class="size-6" />
      </Button>
    </FloatingActionButton>

    <UnsavedChangesDialog
      v-model:open="isUnsavedDialogOpen"
      @discard="confirmLeave"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/valibot";
import { array, integer, maxLength, minLength, minValue, number, object, optional, pipe, string } from "valibot";
import type { InferOutput } from "valibot";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Badge } from "@/components/ui/badge";
import { splitArtistNames } from "@/lib/artist-names";
import { NAME_MAX_LENGTH } from "@/lib/limits";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Scrollable } from "@/components/ui/scrollable";
import FloatingActionButton from "@/components/common/FloatingActionButton.vue";
import { useKeyboardInset } from "@/composables/useKeyboardInset";
import { isLibraryTrack, type Track } from "@/modules/player/types";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { usePanelUiBack } from "@/modules/right-panel/composables/usePanelUiBack";
import type { RightPanelEditTrackPayload } from "@/modules/right-panel/types";
import UnsavedChangesDialog from "@/modules/tracks/components/edit/UnsavedChangesDialog.vue";
import { useTrackEditDraft, type TrackEditDraft } from "@/modules/tracks/composables/useTrackEditDraft";
import { updateTrackMetadataAndSync, type TrackMetadataChanges } from "@/queries/track.queries";
import type { AlbumId } from "@/types/ids";
import RightPanelHeader from "../RightPanelHeader.vue";
import IconDisc from "~icons/tabler/disc";
import IconPencilOff from "~icons/tabler/pencil-off";
import IconSave from "~icons/tabler/device-floppy";

const props = defineProps<{
  payload: RightPanelEditTrackPayload;
}>();

const { t } = useI18n();

// Primary keyboard handling is CSS-only: the viewport meta declares
// interactive-widget=resizes-content, so the panel (fixed inset-0 chain)
// shrinks with the keyboard. On WebViews that ignore it only the visual
// viewport shrinks; the composable measures that leftover overlap (0 when
// the CSS route works) and --keyboard-inset lifts the save button and the
// form's bottom padding above the keyboard.
const { keyboardInset } = useKeyboardInset();
const keyboardInsetStyle = computed(() => ({ "--keyboard-inset": `${keyboardInset.value}px` }));
const queryClient = useQueryClient();
const queueStore = useQueueStore();
const rightPanel = useRightPanelStore();
const { readDraft, setDraft, patchDraft, clearDraft } = useTrackEditDraft();

const buildTrackFormSchema = () => {
  const numberMessage = t("track.edit.validation.numberMin");
  const positiveInteger = () => optional(pipe(
    number(numberMessage),
    integer(numberMessage),
    minValue(1, numberMessage),
  ));

  return object({
    title: pipe(
      string(),
      minLength(1, t("track.edit.validation.titleRequired")),
      maxLength(NAME_MAX_LENGTH, t("track.edit.validation.titleMaxLength", { max: NAME_MAX_LENGTH })),
    ),
    artists: pipe(
      array(pipe(
        string(),
        maxLength(NAME_MAX_LENGTH, t("track.edit.validation.artistMaxLength", { max: NAME_MAX_LENGTH })),
      )),
      minLength(1, t("track.edit.validation.artistsRequired")),
    ),
    // Empty = no album: the track stays album-less, like an import without album tags.
    albumLabel: pipe(
      string(),
      maxLength(NAME_MAX_LENGTH, t("track.edit.validation.albumMaxLength", { max: NAME_MAX_LENGTH })),
    ),
    trackNo: positiveInteger(),
    diskNo: positiveInteger(),
  });
};

type TrackFormValues = InferOutput<ReturnType<typeof buildTrackFormSchema>>;

const validationSchema = computed(() => toTypedSchema(buildTrackFormSchema()));

const { errors, meta, defineField, handleSubmit, resetForm, setValues } = useForm<TrackFormValues>({
  validationSchema,
  initialValues: {
    title: "",
    artists: [],
    albumLabel: "",
    trackNo: undefined,
    diskNo: undefined,
  },
});

const [title] = defineField("title");
const [artists] = defineField("artists");
const [albumLabel] = defineField("albumLabel");
const [trackNo] = defineField("trackNo");
const [diskNo] = defineField("diskNo");

const albumId = ref<string | null>(null);
const newAlbumTitle = ref<string | null>(null);
const pendingLeave = ref<(() => void) | null>(null);

const track = computed<Track | null>(() => {
  return isLibraryTrack(props.payload.track) ? props.payload.track : null;
});

const artistChips = computed(() => artists.value);

const artistsError = computed<string | undefined>(() => {
  const fieldErrors = errors.value as Record<string, string | undefined>;
  if (fieldErrors.artists) return fieldErrors.artists;

  return Object.entries(fieldErrors).find(([key]) => key.startsWith("artists["))?.[1];
});

const changeArtistsLabel = computed(() => `${t("common.change")} — ${t("track.edit.fields.artists")}`);
const changeAlbumLabel = computed(() => `${t("common.change")} — ${t("track.edit.fields.album")}`);

const toOptionalNumber = (value: string | number): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const titleInput = computed<string | number>({
  get: () => title.value,
  set: (value) => {
    title.value = String(value);
  },
});

const trackNoInput = computed<string | number>({
  get: () => trackNo.value ?? "",
  set: (value) => {
    trackNo.value = toOptionalNumber(value);
  },
});

const diskNoInput = computed<string | number>({
  get: () => diskNo.value ?? "",
  set: (value) => {
    diskNo.value = toOptionalNumber(value);
  },
});

const draftFromTrack = (source: Track): TrackEditDraft => ({
  trackId: source.id,
  title: source.title,
  artists: splitArtistNames(source.artist),
  albumId: source.albumId || null,
  albumLabel: source.albumName,
  newAlbumTitle: null,
  trackNo: source.trackNo ?? null,
  diskNo: source.diskNo ?? null,
});

const applyDraft = (source: TrackEditDraft): void => {
  setValues({
    title: source.title,
    artists: [...source.artists],
    albumLabel: source.albumLabel,
    trackNo: source.trackNo ?? undefined,
    diskNo: source.diskNo ?? undefined,
  }, false);

  albumId.value = source.albumId;
  newAlbumTitle.value = source.newAlbumTitle;
};

const draftValues = computed(() => ({
  title: title.value,
  artists: [...artists.value],
  albumId: albumId.value,
  albumLabel: albumLabel.value,
  newAlbumTitle: newAlbumTitle.value,
  trackNo: trackNo.value ?? null,
  diskNo: diskNo.value ?? null,
}));

const syncDraft = (): void => {
  if (!track.value) return;
  patchDraft(track.value.id, draftValues.value);
};

watch(
  track,
  (nextTrack) => {
    if (!nextTrack) {
      resetForm();
      return;
    }

    const stored = readDraft(nextTrack.id);
    const next = stored ?? draftFromTrack(nextTrack);

    if (!stored) setDraft(next);
    applyDraft(next);
  },
  { immediate: true },
);

watch(draftValues, () => {
  syncDraft();
});

const hasChanges = computed(() => {
  const source = track.value;
  if (!source) return false;

  return title.value.trim() !== source.title
    || artistChips.value.join("\n") !== splitArtistNames(source.artist).join("\n")
    || albumId.value !== (source.albumId || null)
    || newAlbumTitle.value !== null
    || (trackNo.value ?? null) !== (source.trackNo ?? null)
    || (diskNo.value ?? null) !== (source.diskNo ?? null);
});

const albumChange = computed<Pick<TrackMetadataChanges, "albumId" | "albumTitle">>(() => {
  if (newAlbumTitle.value) return { albumTitle: newAlbumTitle.value };
  if (albumId.value) return { albumId: albumId.value as AlbumId };

  return {};
});

const isUnsavedDialogOpen = computed<boolean>({
  get: () => pendingLeave.value !== null,
  set: (value) => {
    if (!value) pendingLeave.value = null;
  },
});

const requestLeave = (leave: () => void): void => {
  if (!hasChanges.value) {
    clearDraft();
    leave();
    return;
  }

  pendingLeave.value = leave;
};

const confirmLeave = (): void => {
  const leave = pendingLeave.value;

  pendingLeave.value = null;
  clearDraft();
  leave?.();
};

const handleBack = (): void => {
  requestLeave(() => rightPanel.openTrackInfo({ track: props.payload.track }, { depth: 1 }));
};
usePanelUiBack(handleBack);

const handleClose = (): void => {
  requestLeave(() => rightPanel.close());
};

const openArtistPicker = (): void => {
  const source = track.value;
  if (!source) return;

  syncDraft();

  const trackId = source.id;
  const editTrack = props.payload.track;

  rightPanel.openEntitySelect({
    kind: "artists",
    selectedNames: [...artistChips.value],
    onConfirm: ({ names }) => {
      if (!names) return;
      patchDraft(trackId, { artists: [...names] });
    },
    onDone: () => rightPanel.openEditTrack({ track: editTrack }, { depth: 2 }),
  });
};

const openAlbumPicker = (): void => {
  const source = track.value;
  if (!source) return;

  syncDraft();

  const trackId = source.id;
  const editTrack = props.payload.track;

  rightPanel.openEntitySelect({
    kind: "album",
    selectedAlbumId: albumId.value ?? undefined,
    onConfirm: ({ albumId: nextAlbumId, albumTitle }) => {
      if (nextAlbumId) {
        patchDraft(trackId, {
          albumId: nextAlbumId,
          albumLabel: albumTitle ?? "",
          newAlbumTitle: null,
        });
        return;
      }

      patchDraft(trackId, {
        albumId: null,
        albumLabel: albumTitle ?? "",
        newAlbumTitle: albumTitle ?? null,
      });
    },
    onDone: () => rightPanel.openEditTrack({ track: editTrack }, { depth: 2 }),
  });
};

const { mutateAsync: updateTrack, isPending } = useMutation({
  mutationFn: (changes: TrackMetadataChanges) => {
    const source = track.value;

    if (!source) {
      throw new Error("Track is not editable");
    }

    return updateTrackMetadataAndSync(queryClient, source, changes);
  },
  onError: () => {
    toast.error(t("track.edit.saveFailed"));
  },
});

const onSubmit = handleSubmit(async (values) => {
  if (!track.value || !hasChanges.value) return;

  const nextTrack = await updateTrack({
    title: values.title,
    artistNames: values.artists,
    ...albumChange.value,
    trackNo: values.trackNo ?? null,
    diskNo: values.diskNo ?? null,
  }).catch(() => null);

  if (!nextTrack) return;

  clearDraft();
  queueStore.syncTrackMetadata(nextTrack);
  toast.success(t("track.edit.saved"));
  rightPanel.openTrackInfo({ track: nextTrack }, { depth: 1 });
});
</script>
