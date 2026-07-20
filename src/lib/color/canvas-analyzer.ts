import type { OKLCH } from "./color";
import { oklabToOklch, rgbToOklab } from "./color";

const HUE_BUCKETS = 24;
const CANVAS_SIZE = 96;
const ANALYSIS_TIMEOUT = 10000;

// Below this many opaque pixels the sample is too small to trust.
const MIN_OPAQUE_PIXELS = 40;
// Pixels below this chroma are treated as grey/neutral. Set above typical JPEG/
// WebP chroma noise so a black-and-white cover can't produce a false hue.
const MIN_COLOR_CHROMA = 0.04;
// Salience weighting. The human eye locks onto the most saturated region, not
// the largest one, so a hue's weight grows with chroma^3 — a small vivid accent
// (e.g. a blue tie on a grey suit) then beats a large dull field.
const CHROMA_EXPONENT = 3;
// Adjacent hue buckets are partially merged so one perceptual colour split
// across a bucket boundary isn't diluted into losing.
const NEIGHBOR_WEIGHT = 0.3;
// If less than this fraction of the (centre-weighted) cover carries real colour,
// treat it as monochrome and return a neutral tone instead of amplifying noise.
const MIN_COLORED_FRACTION = 0.01;

interface HueBucket {
  /** Σ centreWeight · chroma^CHROMA_EXPONENT — salience of this hue */
  energy: number;
  /** Σ centreWeight · chroma — normaliser for the weighted means below */
  chromaWeight: number;
  lSum: number;
  aSum: number;
  bSum: number;
}

/** Central pixels count more than edge pixels (album art frames its subject). */
function centerWeight(x: number, y: number, size: number): number {
  const c = (size - 1) / 2;
  const dx = (x - c) / c;
  const dy = (y - c) / c;
  const distance = Math.min(Math.hypot(dx, dy), 1);
  return 1.2 + (0.72 - 1.2) * distance;
}

/** Chroma-weighted mean OKLCH of a bucket and its two neighbours (wrap-safe). */
function bucketColor(buckets: HueBucket[], index: number): OKLCH {
  const n = buckets.length;
  let wc = 0;
  let lSum = 0;
  let aSum = 0;
  let bSum = 0;
  const neighbours: [number, number][] = [
    [index, 1],
    [(index + 1) % n, NEIGHBOR_WEIGHT],
    [(index + n - 1) % n, NEIGHBOR_WEIGHT],
  ];
  for (const [j, factor] of neighbours) {
    const b = buckets[j];
    wc += factor * b.chromaWeight;
    lSum += factor * b.lSum;
    aSum += factor * b.aSum;
    bSum += factor * b.bSum;
  }
  return oklabToOklch({ L: lSum / wc, a: aSum / wc, b: bSum / wc });
}

/**
 * Pick the most salient accent: bucket colourful pixels by OKLab hue, score by
 * chroma^3 (the vivid accent wins over larger dull regions), and return a
 * chroma-weighted mean OKLCH. Near-colourless covers return neutral.
 */
export function analyzeImageData(
  data: Uint8ClampedArray,
  size: number,
): OKLCH | null {
  const buckets: HueBucket[] = Array.from({ length: HUE_BUCKETS }, () => ({
    energy: 0,
    chromaWeight: 0,
    lSum: 0,
    aSum: 0,
    bSum: 0,
  }));

  let opaquePixels = 0;
  let uniformWeight = 0;
  let coloredWeight = 0;
  let lightnessSum = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    opaquePixels++;

    const pixelIndex = i / 4;
    const x = pixelIndex % size;
    const y = Math.floor(pixelIndex / size);

    const { L, a, b } = rgbToOklab(data[i], data[i + 1], data[i + 2]);
    const cw = centerWeight(x, y, size);

    uniformWeight += cw;
    lightnessSum += L * cw;

    const chroma = Math.hypot(a, b);
    if (chroma < MIN_COLOR_CHROMA) continue; // grey / noise doesn't vote on hue
    coloredWeight += cw;

    const hue = (Math.atan2(b, a) * (180 / Math.PI) + 360) % 360;
    const idx = Math.floor((hue / 360) * HUE_BUCKETS) % HUE_BUCKETS;
    const bucket = buckets[idx];

    const w = cw * chroma;
    bucket.energy += cw * chroma ** CHROMA_EXPONENT;
    bucket.chromaWeight += w;
    bucket.lSum += L * w;
    bucket.aSum += a * w;
    bucket.bSum += b * w;
  }

  if (opaquePixels < MIN_OPAQUE_PIXELS || uniformWeight <= 0) {
    return null;
  }

  const neutral = (): OKLCH => ({ L: lightnessSum / uniformWeight, C: 0, h: 0 });

  if (coloredWeight / uniformWeight < MIN_COLORED_FRACTION) {
    return neutral();
  }

  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < HUE_BUCKETS; i++) {
    const score
      = buckets[i].energy
        + NEIGHBOR_WEIGHT
        * (buckets[(i + 1) % HUE_BUCKETS].energy
          + buckets[(i + HUE_BUCKETS - 1) % HUE_BUCKETS].energy);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  if (best < 0) return neutral();

  return bucketColor(buckets, best);
}

export async function analyzeWithCanvas(imageUrl: string): Promise<OKLCH | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    const timeout = setTimeout(() => {
      console.warn("[ColorExtraction] Canvas analysis timeout");
      resolve(null);
    }, ANALYSIS_TIMEOUT);

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      img.onload = null;
      img.onerror = null;
      img.remove();
    };

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;

      try {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          console.warn("[ColorExtraction] No canvas context");
          cleanup();
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
        const { data } = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        const result = analyzeImageData(data, CANVAS_SIZE);
        cleanup();
        resolve(result);
      }
      catch (error) {
        console.error("[ColorExtraction] Canvas error:", error);
        cleanup();
        resolve(null);
      }
    };

    img.onerror = (error) => {
      cleanup();
      console.error("[ColorExtraction] Image load error:", error);
      resolve(null);
    };

    img.src = imageUrl;
  });
}

// Exposed for tests / potential reuse.
export {
  centerWeight,
  CANVAS_SIZE,
  HUE_BUCKETS,
  MIN_OPAQUE_PIXELS,
  MIN_COLOR_CHROMA,
  MIN_COLORED_FRACTION,
};
