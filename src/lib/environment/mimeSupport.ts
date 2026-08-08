import { AUDIO_MIME_TYPES, AudioMimeKey, IMAGE_MIME_TYPES, ImageMimeKey, MimeSupport, SupportLevel } from "@/types/media";

export const VALID_AUDIO_EXTENSIONS = new Set<string>(
  Object.keys(AUDIO_MIME_TYPES).filter(key => !key.includes("-")),
);

export const VALID_AUDIO_MIME_TYPES = new Set<string>(
  Object.values(AUDIO_MIME_TYPES).map(mime => mime.split(";")[0].trim()),
);

const audioElement = typeof document !== "undefined" ? document.createElement("audio") : null;

const imageCache = new Map<string, boolean>();

export const VALID_IMAGE_EXTENSIONS = new Set<string>(
  Object.keys(IMAGE_MIME_TYPES),
);

export const VALID_IMAGE_MIME_TYPES = new Set<string>(
  Object.values(IMAGE_MIME_TYPES).map(mime => mime.split(";")[0].trim()),
);

export const isValidImageExtension = (ext: string): boolean => {
  return VALID_IMAGE_EXTENSIONS.has(ext.toLowerCase());
};

export const isValidImageMimeType = (mimeType: string): boolean => {
  const baseMime = mimeType.split(";")[0].trim();
  return VALID_IMAGE_MIME_TYPES.has(baseMime);
};

export const canPlayAudioType = (mimeType: string): SupportLevel => {
  if (!audioElement) return "";
  return audioElement.canPlayType(mimeType) as SupportLevel;
};

export const isValidAudioExtension = (ext: string): boolean => {
  return VALID_AUDIO_EXTENSIONS.has(ext.toLowerCase());
};

const AUDIO_EXTENSION_BY_MIME = new Map<string, string>(
  Object.entries(AUDIO_MIME_TYPES)
    .filter(([key]) => !key.includes("-"))
    .map(([ext, mime]) => [mime.split(";")[0].trim(), ext]),
);

/** Canonical extension for an audio MIME type, or `""` when it is unknown. */
export const extensionForAudioMimeType = (mimeType: string | undefined): string => {
  if (!mimeType) return "";
  return AUDIO_EXTENSION_BY_MIME.get(mimeType.split(";")[0].trim()) ?? "";
};

export const isValidAudioMimeType = (mimeType: string): boolean => {
  const baseMime = mimeType.split(";")[0].trim();
  return VALID_AUDIO_MIME_TYPES.has(baseMime);
};

export const isValidImportItem = (name: string, mimeType?: string): boolean => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (isValidAudioExtension(ext)) return true;
  if (mimeType && isValidAudioMimeType(mimeType)) return true;

  return false;
};

export const isAudioTypeSupported = (mimeType: string): boolean => {
  const result = canPlayAudioType(mimeType);
  return result === "probably" || result === "maybe";
};

export const checkAudioSupport = (key: AudioMimeKey): MimeSupport => {
  const mimeType = AUDIO_MIME_TYPES[key];
  const level = canPlayAudioType(mimeType);
  return {
    mimeType,
    level,
    supported: level === "probably" || level === "maybe",
  };
};

export const isValidImageFile = (name: string, mimeType?: string): boolean => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (isValidImageExtension(ext)) return true;
  if (mimeType && isValidImageMimeType(mimeType)) return true;

  return false;
};

const TEST_IMAGES: Record<ImageMimeKey, string> = {
  jpeg: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB//9k=",
  png: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  gif: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  webp: "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
  avif: "data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKBzgABpAQ0AIyHhAAAAAACgUIPf9AAAA=",
  svg: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiLz4=",
  ico: "data:image/x-icon;base64,AAABAAEAAQEAAAEAGAAwAAAAFgAAACgAAAABAAAAAgAAAAEAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8AAAA=",
  bmp: "data:image/bmp;base64,Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAA////AA==",
  heic: "",
  heif: "",
  jxl: "",
};

export async function isImageTypeSupported(mimeType: string): Promise<boolean> {
  if (imageCache.has(mimeType)) {
    return imageCache.get(mimeType)!;
  }

  if (mimeType === "image/svg+xml") {
    imageCache.set(mimeType, true);
    return true;
  }

  if (typeof createImageBitmap === "function") {
    try {
      const key = Object.entries(IMAGE_MIME_TYPES)
        .find(([, v]) => v === mimeType)?.[0] as ImageMimeKey | undefined;

      const testData = key ? TEST_IMAGES[key] : "";

      if (!testData) {
        // Fallback
        imageCache.set(mimeType, false);
        return false;
      }

      const response = await fetch(testData);
      const blob = await response.blob();
      await createImageBitmap(blob);

      imageCache.set(mimeType, true);
      return true;
    }
    catch {
      imageCache.set(mimeType, false);
      return false;
    }
  }

  // Fallback
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(mimeType, true);
      resolve(true);
    };
    img.onerror = () => {
      imageCache.set(mimeType, false);
      resolve(false);
    };

    const key = Object.entries(IMAGE_MIME_TYPES)
      .find(([, v]) => v === mimeType)?.[0] as ImageMimeKey | undefined;

    img.src = key ? TEST_IMAGES[key] : "";

    setTimeout(() => {
      if (!imageCache.has(mimeType)) {
        imageCache.set(mimeType, false);
        resolve(false);
      }
    }, 1000);
  });
}

export const getMimeType = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_MIME_TYPES[ext as AudioMimeKey] || IMAGE_MIME_TYPES[ext as ImageMimeKey] || "";
};
