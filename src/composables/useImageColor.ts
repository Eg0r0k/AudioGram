import { analyzeWithCanvas } from "@/lib/color/canvas-analyzer";
import { hexToRgb, rgbToHsl } from "@/lib/color/color";
import { normalizeColor } from "@/lib/color/color-normalization";
import { analyzeWithVibrant } from "@/lib/color/vibrant-analyzer";
import { ref } from "vue";

export interface ColorResult {
  hex: string;
  rgb: string;
  hsl: string;
  isDark: boolean;
}

export interface UseImageColorOptions {
  fallback?: string;
  targetLightness?: number;
}

const DEFAULT_OPTIONS = {
  fallback: "#535353",
  targetLightness: 0.42,
} satisfies Required<UseImageColorOptions>;

function buildColorResult(hex: string): ColorResult {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  return {
    hex,
    rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    hsl: `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%)`,
    isDark: hsl.l < 0.5,
  };
}

export async function getColorFromImage(
  imageUrl: string,
  options: UseImageColorOptions = {},
): Promise<ColorResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const canvasResult = await analyzeWithCanvas(imageUrl);
  if (canvasResult) {
    const normalizedHex = normalizeColor(canvasResult, {
      targetLightness: opts.targetLightness,
    });
    return buildColorResult(normalizedHex);
  }

  const vibrantResult = await analyzeWithVibrant(imageUrl);
  if (vibrantResult) {
    const normalizedHex = normalizeColor(vibrantResult, {
      targetLightness: opts.targetLightness,
    });
    return buildColorResult(normalizedHex);
  }

  console.warn("[useImageColor] All extraction failed, using fallback:", opts.fallback);
  return buildColorResult(opts.fallback);
}

export function useImageColor(initialOptions: UseImageColorOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...initialOptions };
  const fallback = buildColorResult(opts.fallback);

  const color = ref<ColorResult>({ ...fallback });
  const isLoading = ref(false);
  const error = ref<Error | null>(null);

  const extractColor = async (
    imageUrl: string,
    overrideOptions?: UseImageColorOptions,
  ) => {
    isLoading.value = true;
    error.value = null;

    try {
      color.value = await getColorFromImage(imageUrl, {
        ...opts,
        ...overrideOptions,
      });
    }
    catch (err) {
      error.value = err as Error;
      color.value = { ...fallback };
    }
    finally {
      isLoading.value = false;
    }
  };

  const resetColor = () => {
    color.value = { ...fallback };
    error.value = null;
  };

  return {
    color,
    isLoading,
    error,
    extractColor,
    resetColor,
  };
}
