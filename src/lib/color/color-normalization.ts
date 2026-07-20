import type { OKLCH } from "./color";
import { clamp, lerp } from "../math";
import { clampChromaToGamut, oklchToHex } from "./color";

// Larger than any achievable sRGB chroma, so clamping it to gamut yields the
// maximum displayable chroma (the "cusp") for a given lightness and hue.
const GAMUT_PROBE = 0.4;

export interface AccentAdjustOptions {
  /** Lowest allowed accent lightness (very dark covers are lifted to here). */
  minLightness: number;
  /** Highest allowed accent lightness (very light covers are pulled to here). */
  maxLightness: number;
  /** Lightness the accent is nudged toward — near the vivid mid-tone cusp. */
  targetLightness: number;
  /** How strongly (0-1) lightness is pulled toward {@link targetLightness}. */
  lightnessPull: number;
  /** Target chroma as a fraction (0-1) of the maximum displayable chroma. */
  vividness: number;
  /** Absolute minimum chroma so even low-gamut hues stay colourful. */
  chromaFloor: number;
}

// Push chroma toward the gamut cusp and lightness toward a vivid mid-tone;
// saturated accents read as more pleasing than muted ones.
export const DEFAULT_ACCENT_ADJUST: AccentAdjustOptions = {
  minLightness: 0.45,
  maxLightness: 0.7,
  targetLightness: 0.58,
  lightnessPull: 0.35,
  vividness: 0.85,
  chromaFloor: 0.11,
};

/**
 * Turn a raw extracted OKLCH colour into a vivid, legible accent: hue kept
 * exactly, lightness clamped into a readable band, chroma pushed toward the
 * gamut cusp. A neutral (C ~ 0) extraction stays grey.
 */
export function adjustAccentColor(
  { L, C, h }: OKLCH,
  options: AccentAdjustOptions = DEFAULT_ACCENT_ADJUST,
): string {
  // Neutral cover: keep it grey at its own brightness, don't invent a hue.
  if (C < 1e-4) {
    return oklchToHex(clamp(L, options.minLightness, options.maxLightness), 0, 0);
  }

  const lightness = clamp(
    lerp(L, options.targetLightness, options.lightnessPull),
    options.minLightness,
    options.maxLightness,
  );

  const maxChroma = clampChromaToGamut(lightness, GAMUT_PROBE, h);
  const target = Math.max(C, options.chromaFloor, options.vividness * maxChroma);
  const chroma = Math.min(target, maxChroma);

  return oklchToHex(lightness, chroma, h);
}
