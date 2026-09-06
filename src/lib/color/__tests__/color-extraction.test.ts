import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clampChromaToGamut,
  hexToRgb,
  oklchToHex,
  rgbToHsl,
  rgbToOklab,
  rgbToOklch,
} from "../color";
import {
  adjustAccentColor,
  DEFAULT_ACCENT_ADJUST,
} from "../color-normalization";
import {
  analyzeImageData,
  analyzeWithCanvas,
  MIN_OPAQUE_PIXELS,
} from "../canvas-analyzer";

/** Build an RGBA buffer of `size`x`size` from a per-pixel colour function. */
function makeImage(
  size: number,
  fn: (x: number, y: number, i: number) => [number, number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const i = idx * 4;
      const [r, g, b, a] = fn(x, y, idx);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return data;
}

const oklchOf = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  return rgbToOklch(r, g, b);
};
const hueDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const saturationOf = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b).s;
};
const BLUE_HUE = 262; // OKLCH hue of a typical sRGB blue

describe("color math (color.ts)", () => {
  it("parses hex and reports achromatic conversions", () => {
    expect(hexToRgb("#535353")).toEqual({ r: 83, g: 83, b: 83 });
    expect(hexToRgb("not-a-color")).toEqual({ r: 0, g: 0, b: 0 });
    expect(rgbToHsl(128, 128, 128).s).toBe(0);
  });

  it("matches the published OKLab/OKLCH reference values", () => {
    const white = rgbToOklab(255, 255, 255);
    expect(white.L).toBeCloseTo(1, 4);
    expect(Math.hypot(white.a, white.b)).toBeLessThan(1e-4);

    const red = rgbToOklch(255, 0, 0);
    expect(red.L).toBeCloseTo(0.628, 3);
    expect(red.C).toBeCloseTo(0.258, 3);
    expect(red.h).toBeCloseTo(29.23, 1);
  });

  it("round-trips colours through oklchToHex", () => {
    const blue = rgbToOklch(51, 102, 204);
    expect(oklchToHex(blue.L, blue.C, blue.h)).toBe("#3366cc");
  });

  it("trims an out-of-gamut chroma but leaves an in-gamut one", () => {
    const blue = rgbToOklch(51, 102, 204);
    expect(clampChromaToGamut(blue.L, blue.C, blue.h)).toBeCloseTo(blue.C, 5);
    expect(clampChromaToGamut(0.6, 0.4, 142)).toBeLessThan(0.4);
  });
});

describe("adjustAccentColor (vivid, pleasing OKLCH adjustment)", () => {
  it("preserves hue for every colour family", () => {
    for (const [r, g, b] of [
      [51, 102, 204],
      [230, 20, 20],
      [245, 220, 150],
      [60, 10, 10],
      [40, 160, 90],
    ] as const) {
      const src = rgbToOklch(r, g, b);
      const out = oklchOf(adjustAccentColor(src));
      expect(hueDiff(out.h, src.h)).toBeLessThan(2.5);
    }
  });

  it("targets the configured fraction of the maximum displayable chroma", () => {
    const out = oklchOf(adjustAccentColor(rgbToOklch(51, 102, 204)));
    const maxChroma = clampChromaToGamut(out.L, 0.4, out.h);
    expect(out.C).toBeGreaterThanOrEqual(DEFAULT_ACCENT_ADJUST.vividness * maxChroma - 0.01);
    expect(out.C).toBeLessThanOrEqual(maxChroma + 0.01);
  });

  it("rescues a washed-out colour into a vivid one (fixes dullness)", () => {
    const src = rgbToOklch(120, 130, 160); // muted blue-grey, C ~= 0.05
    const out = oklchOf(adjustAccentColor(src));
    expect(out.C).toBeGreaterThan(0.15); // dramatically more saturated
    expect(hueDiff(out.h, src.h)).toBeLessThan(4);
  });

  it("keeps a genuinely neutral extraction grey", () => {
    expect(saturationOf(adjustAccentColor({ L: 0.6, C: 0, h: 0 }))).toBe(0);
  });

  it("clamps lightness into the legible band", () => {
    const dark = oklchOf(adjustAccentColor(rgbToOklch(60, 10, 10)));
    expect(dark.L).toBeGreaterThanOrEqual(DEFAULT_ACCENT_ADJUST.minLightness - 1e-3);
    const light = oklchOf(adjustAccentColor(rgbToOklch(245, 220, 150)));
    expect(light.L).toBeLessThanOrEqual(DEFAULT_ACCENT_ADJUST.maxLightness + 1e-3);
  });
});

describe("analyzeImageData (salient accent extraction)", () => {
  const SIZE = 16;

  it("returns null when there are too few opaque pixels", () => {
    const data = makeImage(SIZE, (_x, _y, i) =>
      (i === 0 ? [30, 90, 200, 255] : [0, 0, 0, 0]));
    expect(analyzeImageData(data, SIZE)).toBeNull();
    expect(MIN_OPAQUE_PIXELS).toBeGreaterThan(1);
  });

  it("extracts the dominant colourful hue of a solid cover", () => {
    const data = makeImage(SIZE, () => [51, 102, 204, 255]);
    const accent = analyzeImageData(data, SIZE)!;
    expect(hueDiff(accent.h, BLUE_HUE)).toBeLessThan(10);
    expect(accent.C).toBeGreaterThan(0.15);
  });

  // The core fix: the salient colour wins, not the largest dull region.
  it("picks a small vivid accent over a large muted field", () => {
    // ~6% vivid blue block, ~44% muted beige field, rest white
    const data = makeImage(SIZE, (x, y) => {
      if (x < 5 && y < 3) return [30, 90, 200, 255]; // vivid blue accent
      if (x < 12) return [170, 140, 110, 255]; // large muted beige field
      return [245, 245, 245, 255]; // white
    });
    const accent = analyzeImageData(data, SIZE)!;
    expect(hueDiff(accent.h, BLUE_HUE)).toBeLessThan(15); // blue, not beige
  });

  // The user's case: mostly white with a small blue accent -> blue background.
  it("finds a small accent on an otherwise white cover", () => {
    const data = makeImage(SIZE, (x, y) =>
      (x >= 6 && x <= 9 && y >= 6 && y <= 9
        ? [30, 90, 200, 255]
        : [245, 245, 246, 255]));
    const accent = analyzeImageData(data, SIZE)!;
    expect(hueDiff(accent.h, BLUE_HUE)).toBeLessThan(15);
    expect(accent.C).toBeGreaterThan(0.1);
  });

  // Regression: a black-and-white cover with a few coloured (compression-noise)
  // pixels must NOT yield a spurious hue — it was returning green.
  it("returns neutral for a monochrome cover with sub-threshold colour noise", () => {
    const data = makeImage(32, (_x, _y, i) => {
      if (i < 5) return [30, 200, 60, 255]; // 5/1024 ~= 0.5% vivid green specks
      const g = (i * 37) % 256;
      return [g, g, g, 255];
    });
    const accent = analyzeImageData(data, 32)!;
    expect(accent.C).toBe(0); // neutral, not green
  });

  it("returns a neutral accent for a fully monochrome cover", () => {
    const data = makeImage(SIZE, () => [130, 130, 130, 255]);
    const accent = analyzeImageData(data, SIZE)!;
    expect(accent.C).toBe(0);
    expect(accent.L).toBeGreaterThan(0.5);
  });
});

describe("analyzeWithCanvas request mode", () => {
  // A CORS-mode load gets its own memory-cache entry, so a plain <img> of the
  // same URL mounted later refetches and flashes blank for a frame.
  const created: HTMLImageElement[] = [];
  const RealImage = globalThis.Image;

  const stubImage = () => {
    created.length = 0;
    vi.stubGlobal("Image", class {
      crossOrigin: string | null = null;
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      remove() {}
      set src(_value: string) {
        created.push(this as unknown as HTMLImageElement);
        queueMicrotask(() => this.onerror?.(new Event("error")));
      }
    });
  };

  afterEach(() => {
    vi.stubGlobal("Image", RealImage);
    vi.restoreAllMocks();
  });

  const loadWith = async (url: string) => {
    stubImage();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await analyzeWithCanvas(url);
    return created[0]?.crossOrigin ?? null;
  };

  it("loads same-origin paths without CORS", async () => {
    expect(await loadWith("/img/liked-fallback.svg")).toBeNull();
  });

  it("loads blob and data URLs without CORS", async () => {
    expect(await loadWith("blob:http://localhost/abc")).toBeNull();
    expect(await loadWith("data:image/png;base64,AAAA")).toBeNull();
  });

  it("loads cross-origin URLs anonymously", async () => {
    expect(await loadWith("http://127.0.0.1:5555/cover/1")).toBe("anonymous");
  });
});
