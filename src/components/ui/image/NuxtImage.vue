<template>
  <img
    v-if="!custom"
    ref="imgEl"
    :class="placeholderSrc ? placeholderClass : undefined"
    v-bind="imgAttrs"
    :alt="props.alt"
    :src="imageSrc"
  >
  <slot
    v-else
    v-bind="{
      imgAttrs,
      isLoaded: placeholderLoaded,
      src: imageSrc,
    }"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useAttrs, useTemplateRef, watch } from "vue";
import type { ImgHTMLAttributes } from "vue";

export interface ImageProps {
  src?: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
  loading?: "lazy" | "eager";
  decoding?: "async" | "sync" | "auto";
  crossorigin?: "anonymous" | "use-credentials" | "";
  sizes?: string;
  srcset?: string;
  custom?: boolean;
  placeholder?: boolean | string | number | [w: number, h: number, q?: number, b?: number];
  placeholderClass?: string;
  fallbackSrc?: string;
}

export interface DefaultSlotProps {
  imgAttrs: ImgHTMLAttributes;
  isLoaded: boolean;
  src?: string;
}

const props = withDefaults(defineProps<ImageProps>(), {
  src: undefined,
  alt: "",
  width: undefined,
  height: undefined,
  loading: "lazy",
  decoding: "async",
  crossorigin: undefined,
  sizes: undefined,
  srcset: undefined,
  placeholder: undefined,
  placeholderClass: undefined,
  fallbackSrc: "",
});

const emit = defineEmits<{
  (event: "load", payload: Event): void;
  (event: "error", payload: string | Event): void;
}>();

defineSlots<{
  default(props: DefaultSlotProps): unknown;
}>();

const imgEl = useTemplateRef<HTMLImageElement>("imgEl");
const placeholderLoaded = ref(false);
const useFallback = ref(false);
const originalSrcFailed = ref(false);

defineExpose({
  imgEl,
  isLoaded: placeholderLoaded,
  hasError: useFallback,
});

const attrs = useAttrs() as ImgHTMLAttributes;

const normalizedAttrs = computed<ImgHTMLAttributes>(() => ({
  alt: props.alt,
  width: props.width,
  height: props.height,
  loading: props.loading,
  decoding: props.decoding,
  crossorigin: props.crossorigin,
}));

const isValidImageSrc = computed(() => {
  if (!props.src) return false;

  const src = props.src.trim();

  if (!src || src === "/" || src === "//") return false;

  if (src.startsWith("data:image/")) return true;

  if (src.startsWith("blob:")) return true;

  const hasImageExtension = /\.(jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?)(\?.*)?$/i.test(src);
  const isAbsoluteUrl = /^https?:\/\//i.test(src);
  const isRelativePath = src.startsWith("/") && src.length > 1;

  return hasImageExtension || isAbsoluteUrl || isRelativePath;
});

const isUsingFallback = computed(() => !isValidImageSrc.value || useFallback.value || originalSrcFailed.value);

const shouldUseResponsiveAttrs = computed(
  () => !isUsingFallback.value && (!props.placeholder || placeholderLoaded.value),
);

const placeholderSrc = computed<string | false>(() => {
  if (isUsingFallback.value || placeholderLoaded.value) {
    return false;
  }

  const placeholderProp = props.placeholder === true ? [10, 10] : props.placeholder;

  if (!placeholderProp) {
    return false;
  }

  if (typeof placeholderProp === "string") {
    return placeholderProp;
  }

  let width = 10;
  let height = 10;

  if (Array.isArray(placeholderProp)) {
    width = placeholderProp[0] ?? 10;
    height = placeholderProp[1] ?? width;
  }
  else if (typeof placeholderProp === "number") {
    width = placeholderProp;
    height = placeholderProp;
  }

  return generatePlaceholderDataUrl(width, height);
});

const imgAttrs = computed<ImgHTMLAttributes>(() => ({
  ...normalizedAttrs.value,
  ...(shouldUseResponsiveAttrs.value ? { sizes: props.sizes, srcset: props.srcset } : {}),
  ...attrs,
}));

const imageSrc = computed(() => {
  if (isUsingFallback.value) {
    return props.fallbackSrc;
  }

  if (placeholderSrc.value) {
    return placeholderSrc.value;
  }

  return props.src!;
});

function generatePlaceholderDataUrl(width: number, height: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#374151"/>
    <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#9CA3AF" font-size="${Math.min(width, height) / 4}">
      No Image
    </text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function resetState() {
  placeholderLoaded.value = false;
  useFallback.value = false;
  originalSrcFailed.value = false;
}

function handleLoadSuccess(event?: Event) {
  placeholderLoaded.value = true;
  emit("load", event || new Event("load"));
}

function handleLoadError(error: unknown) {
  if (originalSrcFailed.value) {
    return;
  }

  originalSrcFailed.value = true;
  useFallback.value = true;
  placeholderLoaded.value = Boolean(props.fallbackSrc);
  emit("error", error instanceof Event ? error : String(error));
}
function loadMainImage() {
  if (!isValidImageSrc.value || originalSrcFailed.value) {
    return;
  }

  const img = new Image();

  if (props.crossorigin) {
    img.crossOrigin = props.crossorigin;
  }

  if (props.sizes) {
    img.sizes = props.sizes;
  }

  if (props.srcset) {
    img.srcset = props.srcset;
  }

  if (typeof img.decode === "function") {
    img.src = props.src!;

    img.decode()
      .then(() => {
        originalSrcFailed.value = false;
        handleLoadSuccess();
      })
      .catch(error => handleLoadError(error));
  }
  else {
    img.onload = (event) => {
      originalSrcFailed.value = false;
      handleLoadSuccess(event);
    };
    img.onerror = event => handleLoadError(event);
    img.src = props.src!;
  }
}
function setupImageListeners() {
  if (!imgEl.value) {
    return;
  }

  if (imgEl.value.complete) {
    if (imgEl.value.naturalWidth === 0) {
      handleLoadError(new Event("error"));
    }
    else {
      handleLoadSuccess();
    }
    return;
  }

  imgEl.value.onload = (event) => {
    if (!originalSrcFailed.value) {
      handleLoadSuccess(event);
    }
    else {
      placeholderLoaded.value = true;
    }
  };

  imgEl.value.onerror = event => handleLoadError(event);
}

watch(() => props.src, (newSrc, oldSrc) => {
  if (newSrc !== oldSrc) {
    resetState();

    if (props.placeholder || props.custom) {
      loadMainImage();
    }
  }
});

onMounted(() => {
  if (!isValidImageSrc.value) {
    useFallback.value = true;
    originalSrcFailed.value = true;
    return;
  }

  if (props.placeholder || props.custom) {
    loadMainImage();
    return;
  }

  setupImageListeners();
});
</script>
