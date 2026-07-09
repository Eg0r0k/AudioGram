import { clamp } from "../math";
import { HSL, RGB, rgbToHsl } from "./color";
import { isDirtyColor } from "./color-filters";
import { getPixelWeight, isUsefulColor, scoreColor } from "./color-scoring";

const HUE_BUCKETS = 36;
const CANVAS_SIZE = 96;
const ANALYSIS_TIMEOUT = 10000;

interface ColorBucket {
  rgb: RGB;
  hsl: HSL;
  count: number;
  weightedCount: number;
  bestScore: number;
  hSum: number;
  sSum: number;
  lSum: number;
  centerWeightSum: number;
  bestHsl: HSL;
}

function createEmptyBucket(): ColorBucket {
  return {
    rgb: { r: 0, g: 0, b: 0 },
    hsl: { h: 0, s: 0, l: 0 },
    count: 0,
    weightedCount: 0,
    bestScore: 0,
    hSum: 0,
    sSum: 0,
    lSum: 0,
    centerWeightSum: 0,
    bestHsl: { h: 0, s: 0, l: 0 },
  };
}

export async function analyzeWithCanvas(imageUrl: string): Promise<HSL | null> {
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

function analyzeImageData(data: Uint8ClampedArray, size: number): HSL | null {
  const buckets: ColorBucket[] = Array.from(
    { length: HUE_BUCKETS },
    createEmptyBucket,
  );

  let usefulPixels = 0;
  let lightPixels = 0;
  let grayPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4;
    const x = pixelIndex % size;
    const y = Math.floor(pixelIndex / size);

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 16) continue;

    const hsl = rgbToHsl(r, g, b);
    const { h, s, l } = hsl;

    if (l > 0.92) lightPixels++;
    if (s < 0.08) grayPixels++;

    const rgb: RGB = { r, g, b };
    if (!isUsefulColor(hsl, rgb)) continue;

    usefulPixels++;

    const bucketIdx = Math.floor((h / 360) * HUE_BUCKETS) % HUE_BUCKETS;
    const bucket = buckets[bucketIdx];
    const centerWeight = getPixelWeight(x, y, size);

    bucket.count++;
    bucket.weightedCount += centerWeight;
    bucket.hSum += h * centerWeight;
    bucket.sSum += s * centerWeight;
    bucket.lSum += l * centerWeight;
    bucket.centerWeightSum += centerWeight;

    const pixelScore = scoreColor(rgb, 1, centerWeight);
    if (pixelScore > bucket.bestScore) {
      bucket.bestScore = pixelScore;
      bucket.bestHsl = { h, s, l };
      bucket.rgb = rgb;
      bucket.hsl = hsl;
    }
  }

  const totalPixels = size * size;
  const lightRatio = lightPixels / totalPixels;
  const grayRatio = grayPixels / totalPixels;
  const usefulRatio = usefulPixels / totalPixels;

  if (lightRatio > 0.55 && usefulRatio < 0.08) {
    console.warn("[ColorExtraction] Mostly light/empty image");
    return null;
  }

  if (grayRatio > 0.78 && usefulRatio < 0.06) {
    console.warn("[ColorExtraction] Mostly grayscale image");
    return null;
  }

  if (usefulPixels < 70) {
    console.warn("[ColorExtraction] Not enough useful pixels");
    return null;
  }

  // Calculate average colors for buckets
  for (const bucket of buckets) {
    if (bucket.count > 0 && bucket.centerWeightSum > 0) {
      bucket.hsl = {
        h: bucket.hSum / bucket.centerWeightSum,
        s: bucket.sSum / bucket.centerWeightSum,
        l: bucket.lSum / bucket.centerWeightSum,
      };
    }
  }

  // Find best color through multiple passes
  return findBestColor(buckets, usefulPixels);
}

function findBestColor(buckets: ColorBucket[], usefulPixels: number): HSL | null {
  // Pass 1: Best accent color
  const minAccentWeight = Math.max(4, usefulPixels * 0.0035);
  let bestAccent: ColorBucket | null = null;
  let bestAccentScore = 0;

  for (const bucket of buckets) {
    if (bucket.weightedCount < minAccentWeight) continue;
    if (isDirtyColor(bucket.bestHsl)) continue;

    const weightRatio = bucket.weightedCount / Math.max(bucket.count, 1);
    const score = scoreColor(bucket.rgb, bucket.count, clamp(weightRatio, 0.75, 1.25));

    if (score > bestAccentScore) {
      bestAccentScore = score;
      bestAccent = bucket;
    }
  }

  if (bestAccent && bestAccentScore > 0.20) {
    return bestAccent.bestHsl;
  }

  // Pass 2: Best dominant color
  let bestDominant: ColorBucket | null = null;
  let bestDominantScore = 0;

  for (const bucket of buckets) {
    if (bucket.weightedCount < usefulPixels * 0.03) continue;
    if (isDirtyColor(bucket.bestHsl)) continue;

    const dominance = bucket.weightedCount / usefulPixels;
    const score = scoreColor(bucket.rgb, bucket.count) * (0.85 + dominance * 0.8);

    if (score > bestDominantScore) {
      bestDominantScore = score;
      bestDominant = bucket;
    }
  }

  if (bestDominant) {
    return bestDominant.bestHsl;
  }

  // Pass 3: Any acceptable color
  for (const bucket of buckets) {
    if (bucket.count < 10) continue;
    if (!isDirtyColor(bucket.bestHsl) && bucket.bestHsl.s > 0.16) {
      return bucket.bestHsl;
    }
  }

  console.warn("[ColorExtraction] All passes failed");
  return null;
}
