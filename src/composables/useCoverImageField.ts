import { computed, ref } from "vue";
import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";
import { requestFiles } from "@/lib/files/requestFiles";
import { IMAGE_MIME_TYPES } from "@/types/media";
import { isValidImageFile } from "@/lib/environment/mimeSupport";

export type CoverSelectionErrorType = "CANCELLED" | "INVALID_FORMAT" | "READ_ERROR";

export interface CoverImageChange {
  coverBlob?: Blob;
  removeCover?: boolean;
}

/**
 * Owns the cover-image editing lifecycle shared by the entity edit dialogs:
 * file selection, cropper hand-off, blob-URL bookkeeping, preview, and the
 * resulting change payload. State is component-local; create one per dialog.
 */
export function useCoverImageField() {
  const originalCoverUrl = ref<string | null>(null);
  const newCoverBlobUrl = ref<string | null>(null);
  const coverBlob = ref<Blob | null>(null);
  const isCoverRemoved = ref(false);

  const isCropperOpen = ref(false);
  const selectedImageSrc = ref("");

  const acceptString = Object.values(IMAGE_MIME_TYPES).join(",");

  const previewUrl = computed<string | null>(() => {
    if (isCoverRemoved.value) return null;
    if (newCoverBlobUrl.value) return newCoverBlobUrl.value;
    return originalCoverUrl.value;
  });

  const hasChanged = computed(() => coverBlob.value !== null || isCoverRemoved.value);

  function readFileAsDataUrl(file: File): Promise<Result<string, CoverSelectionErrorType>> {
    // Promise.withResolvers is ES2024; this project targets ES2020, so use the executor form.
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (e: ProgressEvent<FileReader>): void => {
        const result = e.target?.result;
        resolve(typeof result === "string" ? ok(result) : err("READ_ERROR"));
      };

      reader.onerror = (): void => resolve(err("READ_ERROR"));

      reader.readAsDataURL(file);
    });
  }

  async function selectFile(): Promise<Result<string, CoverSelectionErrorType>> {
    let files: File[];

    try {
      files = await requestFiles({ accept: acceptString, multiple: false });
    }
    catch {
      return err("CANCELLED");
    }

    if (files.length === 0) return err("CANCELLED");

    const file = files[0];
    if (!isValidImageFile(file.name, file.type)) return err("INVALID_FORMAT");

    return readFileAsDataUrl(file);
  }

  function applyCropped(blob: Blob): void {
    coverBlob.value = blob;
    isCoverRemoved.value = false;

    if (newCoverBlobUrl.value) URL.revokeObjectURL(newCoverBlobUrl.value);
    newCoverBlobUrl.value = URL.createObjectURL(blob);
  }

  function remove(): void {
    if (newCoverBlobUrl.value) {
      URL.revokeObjectURL(newCoverBlobUrl.value);
      newCoverBlobUrl.value = null;
    }

    coverBlob.value = null;
    isCoverRemoved.value = true;
  }

  function getChange(): CoverImageChange {
    if (coverBlob.value) return { coverBlob: coverBlob.value };
    if (isCoverRemoved.value && originalCoverUrl.value) return { removeCover: true };
    return {};
  }

  function cleanupBlobUrls(): void {
    if (newCoverBlobUrl.value) URL.revokeObjectURL(newCoverBlobUrl.value);
  }

  function reset(): void {
    cleanupBlobUrls();
    originalCoverUrl.value = null;
    newCoverBlobUrl.value = null;
    coverBlob.value = null;
    isCoverRemoved.value = false;
    isCropperOpen.value = false;
    selectedImageSrc.value = "";
  }

  return {
    originalCoverUrl,
    isCropperOpen,
    selectedImageSrc,
    previewUrl,
    hasChanged,
    selectFile,
    applyCropped,
    remove,
    getChange,
    cleanupBlobUrls,
    reset,
  };
}
