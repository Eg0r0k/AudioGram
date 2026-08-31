<template>
  <Dialog
    :open="open"
    @update:open="handleOpenChange"
  >
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ $t("dialogs.editAvatar.title") }}</DialogTitle>
      </DialogHeader>

      <div class="h-[400px] w-full rounded-md overflow-hidden relative">
        <template v-if="currentImageSrc">
          <vue-cropper
            ref="cropperRef"
            :src="currentImageSrc"
            :aspect-ratio="1"
            :view-mode="1"
            drag-mode="move"
            :background="false"
            :auto-crop-area="1"
            class="h-full w-full"
            @ready="isReady = true"
          />
        </template>
        <div
          v-else
          class="flex h-full w-full items-center justify-center bg-muted text-muted-foreground"
        >
          <div class="text-center">
            <IconPhoto class="mx-auto size-12 mb-2" />
            <p>{{ $t("dialogs.editAvatar.noImage") }}</p>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="destructive-link"
          :disabled="isSaving"
          @click="handleClose"
        >
          {{ $t("common.cancel") }}
        </Button>
        <Button
          variant="ghost-primary"
          class="sm:mr-auto"
          :disabled="isSaving"
          @click="handleSelectFile"
        >
          {{ currentImageSrc ? $t("common.change") : $t("common.select") }}
        </Button>

        <Button
          v-if="currentImageSrc"
          variant="ghost-primary"

          :disabled="isSaving || !isReady"
          @click="handleSave"
        >
          <IconLoader2
            v-if="isSaving"
            class="mr-2 size-4 animate-spin"
          />
          {{ $t("common.save") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onUnmounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import type Cropper from "cropperjs";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import IconLoader2 from "~icons/tabler/loader-2";
import IconPhoto from "~icons/tabler/photo";
import { requestFiles } from "@/lib/files/requestFiles";
import { IMAGE_MIME_TYPES } from "@/types/media";
import { isValidImageFile } from "@/lib/environment/mimeSupport";
import { formatBytes } from "@/lib/format/memory";
import { getLogger } from "@/lib/logger";

const { t } = useI18n();

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_FILE_SIZE_MB = MAX_FILE_SIZE_BYTES / (1024 * 1024);
interface VueCropperComponent {
  cropper: Cropper;
  replace: (url: string) => void;
  getCroppedCanvas: (options?: Cropper.GetCroppedCanvasOptions) => HTMLCanvasElement | null;
  getData: (rounded?: boolean) => Cropper.Data;
  getContainerData: () => Cropper.ContainerData;
  getImageData: () => Cropper.ImageData;
  getCanvasData: () => Cropper.CanvasData;
  getCropBoxData: () => Cropper.CropBoxData;
  reset: () => void;
  clear: () => void;
  destroy: () => void;
}

interface FileSelectionError extends Error {
  message: string;
}

function isFileSelectionError(error: unknown): error is FileSelectionError {
  return error instanceof Error;
}

function isUserCancellation(error: FileSelectionError): boolean {
  return error.message === "CANCELLED" || error.message === "NO_FILE_SELECTED";
}

const VueCropper = defineAsyncComponent({
  loader: async () => {
    await import("cropperjs/dist/cropper.css");
    return import("vue-cropperjs");
  },
  loadingComponent: {
    template: "<div class=\"flex h-full w-full items-center justify-center text-muted-foreground\"><icon-loader class=\"animate-spin size-8\" /></div>",
    components: { IconLoader: IconLoader2 },
  },
  delay: 200,
});

const props = defineProps<{
  open: boolean;
  imageSrc: string;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "save": [blob: Blob];
  "error": [message: string];
}>();

const cropperRef = shallowRef<VueCropperComponent | null>(null);

const localImageSrc = ref<string | null>(null);
const isReady = ref(false);
const isSaving = ref(false);
const currentMimeType = ref<string>("image/jpeg");

const currentImageSrc = computed(() => localImageSrc.value ?? props.imageSrc);

const acceptString = Object.values(IMAGE_MIME_TYPES).join(",");

watch(
  () => props.imageSrc,
  (newSrc) => {
    if (newSrc && props.open) {
      localImageSrc.value = null;
      isReady.value = false;

      if (cropperRef.value) {
        cropperRef.value.replace(newSrc);
      }
    }
  },
);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      localImageSrc.value = null;
      isReady.value = false;
      isSaving.value = false;
    }
  },
);

const handleSelectFile = async (): Promise<void> => {
  const filesResult = await requestFiles({
    accept: acceptString,
    multiple: false,
  }).catch((error: unknown) => {
    if (isFileSelectionError(error) && !isUserCancellation(error)) {
      getLogger().error(`[EditAvatar] File selection failed: ${String(error)}`);
      emit("error", t("dialogs.editAvatar.errors.loadFailed"));
    }
    return null;
  });

  if (!filesResult?.length) return;

  const file = filesResult[0];

  if (!isValidImageFile(file.name, file.type)) {
    emit("error", t("dialogs.editAvatar.errors.invalidFormat"));
    return;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    emit("error", t("dialogs.editAvatar.errors.fileTooLarge", {
      maxSize: MAX_FILE_SIZE_MB,
      fileSize: formatBytes(file.size),
    }));
    return;
  }

  isReady.value = false;
  currentMimeType.value = file.type || "image/jpeg";

  const reader = new FileReader();

  reader.onload = (e: ProgressEvent<FileReader>): void => {
    const result = e.target?.result;

    if (typeof result !== "string") return;

    localImageSrc.value = result;

    if (cropperRef.value) {
      cropperRef.value.replace(result);
    }
  };

  reader.onerror = (): void => {
    emit("error", t("dialogs.editAvatar.errors.readFailed"));
  };

  reader.readAsDataURL(file);
};

const handleSave = (): void => {
  if (!cropperRef.value) return;

  isSaving.value = true;

  const canvas = cropperRef.value.getCroppedCanvas({
    width: 400,
    height: 400,
    fillColor: "#fff",
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
  });

  if (!canvas) {
    isSaving.value = false;
    emit("error", t("dialogs.editAvatar.errors.cropFailed"));
    return;
  }

  canvas.toBlob(
    (blob: Blob | null): void => {
      if (blob) {
        emit("save", blob);
        handleClose();
      }
      else {
        emit("error", t("dialogs.editAvatar.errors.createFailed"));
      }
      isSaving.value = false;
    },
    currentMimeType.value,
    0.9,
  );
};

const handleClose = (): void => {
  emit("update:open", false);
};

const handleOpenChange = (val: boolean): void => {
  if (!val) {
    setTimeout(() => {
      localImageSrc.value = null;
      isReady.value = false;
      isSaving.value = false;
    }, 300);
  }
  emit("update:open", val);
};

onUnmounted(() => {
  if (localImageSrc.value?.startsWith("blob:")) {
    URL.revokeObjectURL(localImageSrc.value);
  }
});
</script>
