import { clamp, lerp } from "../math";
import { hslToHex, type HSL } from "./color";
import { getTargetLightness } from "./color-scoring";

export interface ColorNormalizationOptions {
  targetLightness: number;
}

function compensateHueForDarkening(
  hue: number,
  _saturation: number,
  currentL: number,
  targetL: number,
): number {
  if (targetL >= currentL) return hue;

  const darkening = currentL - targetL;
  if (darkening < 0.05) return hue;

  // Yellow
  if (hue >= 35 && hue <= 72) {
    return hue - darkening * 25;
  }

  // Green-Yellow
  if (hue > 72 && hue <= 100) {
    return hue + darkening * 18;
  }

  // Cian
  if (hue >= 170 && hue <= 200) {
    return hue - darkening * 10;
  }

  return hue;
}

function compensateSaturationForDarkening(
  hue: number,
  saturation: number,
  currentL: number,
  targetL: number,
): number {
  if (targetL >= currentL) return saturation;

  const darkening = currentL - targetL;
  if (darkening < 0.05) return saturation;

  // Fix Yellow
  if (hue >= 35 && hue <= 72) {
    return saturation + darkening * 0.30;
  }

  if (hue > 72 && hue <= 100) {
    return saturation + darkening * 0.20;
  }

  // Little compisation
  return saturation + darkening * 0.10;
}

export function normalizeColor(
  hsl: HSL,
  options: ColorNormalizationOptions,
): string {
  const { h, s, l } = hsl;
  let hFinal = h;
  let sFinal = s;

  // Fix dark colors
  if (h >= 35 && h <= 65 && s < 0.25) {
    hFinal = 35;
    sFinal = Math.max(s, 0.50);
  }
  else if (h >= 65 && h <= 100 && s < 0.25) {
    hFinal = 140;
    sFinal = Math.max(s, 0.48);
  }

  const targetL = getTargetLightness(hFinal, options.targetLightness);

  // Make compinsation
  hFinal = compensateHueForDarkening(hFinal, sFinal, l, targetL);
  sFinal = compensateSaturationForDarkening(hFinal, sFinal, l, targetL);

  const sFloor = 0.45;
  const sCeil = 0.78;
  sFinal = clamp(sFinal, sFloor, sCeil);

  // Bright
  const lMix = clamp(l, 0.25, 0.75);
  const finalL = lerp(targetL, lMix, 0.15);

  return hslToHex(hFinal, sFinal, finalL);
}
