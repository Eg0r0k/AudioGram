import { analyzeWithCanvas } from "@/lib/color/canvas-analyzer";
import { hexToRgb, rgbToHsl } from "@/lib/color/color";
import { adjustAccentColor } from "@/lib/color/color-normalization";
import { ref } from "vue";

export interface ColorResult {
  hex: string;
  rgb: string;
  hsl: string;
  isDark: boolean;
}

export interface UseImageColorOptions {
  fallback?: string;
}

const DEFAULT_OPTIONS = {
  fallback: "#535353",
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

  const accent = await analyzeWithCanvas(imageUrl);
  if (accent) {
    return buildColorResult(adjustAccentColor(accent));
  }

  console.warn("[useImageColor] Extraction failed, using fallback:", opts.fallback);
  return buildColorResult(opts.fallback);
}

export function useImageColor(initialOptions: UseImageColorOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...initialOptions };
  const fallback = buildColorResult(opts.fallback);

  const color = ref<ColorResult>({ ...fallback });
  const isLoading = ref(false);
  const error = ref<Error | null>(null);

  // Guards against overlapping extractions: only the most recent request may
  // write the result, so a slow older cover can never clobber a newer one.
  let requestId = 0;

  const extractColor = async (
    imageUrl: string,
    overrideOptions?: UseImageColorOptions,
  ) => {
    const id = ++requestId;
    isLoading.value = true;
    error.value = null;

    try {
      const result = await getColorFromImage(imageUrl, {
        ...opts,
        ...overrideOptions,
      });
      if (id !== requestId) return;
      color.value = result;
    }
    catch (err) {
      if (id !== requestId) return;
      error.value = err as Error;
      color.value = { ...fallback };
    }
    finally {
      if (id === requestId) isLoading.value = false;
    }
  };

  const resetColor = () => {
    requestId++;
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
