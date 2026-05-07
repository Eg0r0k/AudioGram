<!-- eslint-disable vuejs-accessibility/label-has-for -->
<template>
  <Dialog
    :open="open"
    @update:open="handleOpenChange"
  >
    <DialogContent class="w-full max-w-[95vw] sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ $t("dialogs.editPlaylist.title") }}</DialogTitle>
      </DialogHeader>

      <Alert
        v-if="imageError"
        variant="destructive"
        class="py-2"
      >
        <IconAlertCircle class="size-4" />
        <AlertTitle>{{ imageError }}</AlertTitle>
      </Alert>

      <form
        class="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6"
        @submit.prevent="onSubmit"
      >
        <div class="flex relative flex-col gap-2">
          <button
            type="button"
            class="group relative cursor-pointer size-48 overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/25 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="{ 'border-destructive': imageError }"
            :disabled="isSaving"
            @click="handleSelectCover"
          >
            <img
              v-if="coverPreviewUrl"
              :src="coverPreviewUrl"
              alt="Playlist cover preview"
              class="size-full object-cover"
            >
            <div
              v-else
              class="flex size-full items-center justify-center bg-muted"
            >
              <IconPhoto class="size-6 sm:size-8 text-muted-foreground" />
            </div>

            <Button
              v-if="coverPreviewUrl"
              class="absolute top-2 right-2"
              variant="destructive-link"
              size="icon-sm"
              :disabled="isSaving"
              @click.stop="handleRemoveCover"
            >
              <IconTrash class="size-4" />
            </Button>
          </button>
        </div>

        <div class="flex flex-col gap-4 min-w-0">
          <div class="space-y-2">
            <Label
              for="playlist-name"
              :class="{ 'text-destructive': errors.name }"
            >
              {{ $t("dialogs.editPlaylist.playlistName") }}
            </Label>

            <Input
              id="playlist-name"
              v-model="name"
              :placeholder="$t('dialogs.editPlaylist.namePlaceholder')"
              :disabled="isSaving"
              :class="{ 'border-destructive focus-visible:ring-destructive': errors.name }"
              @keydown.enter.prevent="onSubmit"
            />

            <p
              v-if="errors.name"
              class="text-sm text-destructive"
            >
              {{ errors.name }}
            </p>
          </div>

          <div class="space-y-2">
            <Label
              for="playlist-description"
              :class="{ 'text-destructive': errors.description }"
            >
              {{ $t("dialogs.editPlaylist.description") }}
            </Label>

            <Textarea
              id="playlist-description"
              v-model="description"
              :placeholder="$t('dialogs.editPlaylist.descriptionPlaceholder')"
              :disabled="isSaving"
              :class="{ 'border-destructive focus-visible:ring-destructive': errors.description }"
            />

            <p
              v-if="errors.description"
              class="text-sm text-destructive"
            >
              {{ errors.description }}
            </p>
          </div>
        </div>
      </form>

      <DialogFooter class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="destructive-link"
          class="w-full sm:w-auto"
          :disabled="isSaving"
          @click="handleClose"
        >
          {{ $t("common.cancel") }}
        </Button>

        <Button
          variant="link"
          class="w-full sm:w-auto"
          :disabled="isSaving || !meta.valid || !hasChanges"
          @click="onSubmit"
        >
          {{ $t("common.save") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <EditAvatarDialog
    v-model:open="isCropperOpen"
    :image-src="selectedImageSrc"
    @save="handleCroppedImage"
    @error="handleCropperError"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useForm } from "vee-validate";

import { err, ok, Result } from "neverthrow";
import { useI18n } from "vue-i18n";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import type { PlaylistEntity } from "@/db/entities";
import { requestFiles } from "@/lib/files/requestFiles";
import { IMAGE_MIME_TYPES } from "@/types/media";
import { isValidImageFile } from "@/lib/environment/mimeSupport";
import EditAvatarDialog from "@/components/dialogs/EditAvatarDialog.vue";
import type { PlaylistChanges } from "../../composables/usePlaylistPage";

import IconPhoto from "~icons/tabler/photo";
import IconTrash from "~icons/tabler/trash";
import IconAlertCircle from "~icons/tabler/alert-circle";
import { InferOutput, maxLength, minLength, object, optional, pipe, string } from "valibot";
import { toTypedSchema } from "@vee-validate/valibot";

const { t } = useI18n();

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 300;

const playlistFormSchema = object({
  name: pipe(
    string(),
    minLength(1, t("dialogs.editPlaylist.validation.nameRequired")),
    maxLength(MAX_NAME_LENGTH, t("dialogs.editPlaylist.validation.nameMaxLength", { max: MAX_NAME_LENGTH })),
  ),
  description: optional(pipe(
    string(),
    maxLength(MAX_DESCRIPTION_LENGTH, t("dialogs.editPlaylist.validation.descriptionMaxLength", { max: MAX_DESCRIPTION_LENGTH })),
  )),
});
type PlaylistFormValues = InferOutput<typeof playlistFormSchema>;

type FileSelectionErrorType = "CANCELLED" | "INVALID_FORMAT" | "READ_ERROR";

interface FileSelectionError {
  type: FileSelectionErrorType;
  message: string;
}

const props = defineProps<{
  open: boolean;
  playlist: PlaylistEntity | null;
  currentCoverUrl?: string | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "save": [changes: PlaylistChanges];
}>();

const { errors, meta, defineField, handleSubmit, resetForm, setValues } = useForm<PlaylistFormValues>({
  validationSchema: toTypedSchema(playlistFormSchema),
  initialValues: {
    name: "",
    description: "",
  },
});

const [name] = defineField("name");
const [description] = defineField("description");

const originalCoverUrl = ref<string | null>(null);
const newCoverBlobUrl = ref<string | null>(null);
const coverBlob = ref<Blob | null>(null);
const isCoverRemoved = ref(false);

const isCropperOpen = ref(false);
const selectedImageSrc = ref("");

const isSaving = ref(false);
const imageError = ref<string | null>(null);

const acceptString = Object.values(IMAGE_MIME_TYPES).join(",");

const coverPreviewUrl = computed((): string | null => {
  if (isCoverRemoved.value) return null;
  if (newCoverBlobUrl.value) return newCoverBlobUrl.value;
  return originalCoverUrl.value;
});

const hasChanges = computed((): boolean => {
  if (!props.playlist) return false;

  const nameChanged = (name.value?.trim() ?? "") !== props.playlist.name;
  const descriptionChanged = (description.value?.trim() ?? "") !== (props.playlist.description ?? "");
  const coverChanged = coverBlob.value !== null || isCoverRemoved.value;

  return nameChanged || descriptionChanged || coverChanged;
});

watch(
  () => [props.open, props.playlist, props.currentCoverUrl] as const,
  ([isOpen, playlist]) => {
    if (isOpen && playlist) {
      initializeForm(playlist);
    }
  },
  { immediate: true },
);

function initializeForm(playlist: PlaylistEntity): void {
  resetFormState();

  setValues({
    name: playlist.name,
    description: playlist.description ?? "",
  });

  originalCoverUrl.value = props.currentCoverUrl ?? null;
}

async function handleSelectCover(): Promise<void> {
  imageError.value = null;

  const result = await selectImageFile();

  result.match(
    (dataUrl) => {
      selectedImageSrc.value = dataUrl;
      isCropperOpen.value = true;
    },
    (error) => {
      if (error.type !== "CANCELLED") {
        imageError.value = getErrorMessage(error.type);
      }
    },
  );
}

function getErrorMessage(errorType: FileSelectionErrorType): string {
  switch (errorType) {
    case "INVALID_FORMAT":
      return t("dialogs.editPlaylist.errors.invalidFormat");
    case "READ_ERROR":
      return t("dialogs.editPlaylist.errors.readError");
    default:
      return t("dialogs.editPlaylist.errors.unknown");
  }
}

async function selectImageFile(): Promise<Result<string, FileSelectionError>> {
  let files: File[];

  try {
    files = await requestFiles({
      accept: acceptString,
      multiple: false,
    });
  }
  catch {
    return err({ type: "CANCELLED", message: "File selection cancelled" });
  }

  if (files.length === 0) {
    return err({ type: "CANCELLED", message: "No file selected" });
  }

  const file = files[0];

  if (!isValidImageFile(file.name, file.type)) {
    return err({ type: "INVALID_FORMAT", message: "Invalid file format" });
  }

  return readFileAsDataUrl(file);
}

function readFileAsDataUrl(file: File): Promise<Result<string, FileSelectionError>> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e: ProgressEvent<FileReader>): void => {
      const result = e.target?.result;
      if (typeof result === "string") {
        resolve(ok(result));
      }
      else {
        resolve(err({ type: "READ_ERROR", message: "Failed to read file" }));
      }
    };

    reader.onerror = (): void => {
      resolve(err({ type: "READ_ERROR", message: "Failed to read file" }));
    };

    reader.readAsDataURL(file);
  });
}

function handleCroppedImage(blob: Blob): void {
  coverBlob.value = blob;
  isCoverRemoved.value = false;
  imageError.value = null;

  if (newCoverBlobUrl.value) {
    URL.revokeObjectURL(newCoverBlobUrl.value);
  }
  newCoverBlobUrl.value = URL.createObjectURL(blob);
}

function handleCropperError(error: string): void {
  imageError.value = error;
}

function handleRemoveCover(): void {
  if (newCoverBlobUrl.value) {
    URL.revokeObjectURL(newCoverBlobUrl.value);
    newCoverBlobUrl.value = null;
  }

  coverBlob.value = null;
  isCoverRemoved.value = true;
  imageError.value = null;
}

const onSubmit = handleSubmit((values) => {
  if (!props.playlist || !hasChanges.value || isSaving.value) return;

  const changes = buildChanges(values);
  if (Object.keys(changes).length === 0) return;

  isSaving.value = true;
  emit("save", changes);
});

function buildChanges(values: PlaylistFormValues): PlaylistChanges {
  const changes: PlaylistChanges = {};

  if (!props.playlist) return changes;

  const trimmedName = values.name.trim();
  if (trimmedName && trimmedName !== props.playlist.name) {
    changes.name = trimmedName;
  }

  const trimmedDescription = values.description?.trim() ?? "";
  if (trimmedDescription !== (props.playlist.description ?? "")) {
    changes.description = trimmedDescription;
  }

  if (coverBlob.value) {
    changes.coverBlob = coverBlob.value;
  }
  else if (isCoverRemoved.value && originalCoverUrl.value) {
    changes.removeCover = true;
  }

  return changes;
}

function handleClose(): void {
  emit("update:open", false);
}

function handleOpenChange(value: boolean): void {
  if (!value) {
    setTimeout(() => {
      cleanupBlobUrls();
      resetFormState();
    }, 300);
  }
  emit("update:open", value);
}

function cleanupBlobUrls(): void {
  if (newCoverBlobUrl.value) {
    URL.revokeObjectURL(newCoverBlobUrl.value);
  }
}

function resetFormState(): void {
  resetForm();
  originalCoverUrl.value = null;
  newCoverBlobUrl.value = null;
  coverBlob.value = null;
  isCoverRemoved.value = false;
  isSaving.value = false;
  imageError.value = null;
  selectedImageSrc.value = "";
}
</script>
