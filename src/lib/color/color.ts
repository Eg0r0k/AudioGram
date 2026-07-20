export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** OKLab: perceptually uniform. L in [0,1], a/b are opponent axes. */
export interface OKLab {
  L: number;
  a: number;
  b: number;
}

/** OKLCH: cylindrical OKLab. L in [0,1], C >= 0 (chroma), h in [0,360). */
export interface OKLCH {
  L: number;
  C: number;
  h: number;
}

export function hexToRgb(hex: string): RGB {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

export function rgbToHsl(r: number, g: number, b: number): HSL {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const delta = max - min;
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / delta + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / delta + 4;
        break;
    }

    h /= 6;
  }

  return { h: h * 360, s, l };
}

const DEG = 180 / Math.PI;

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** sRGB (0-255) -> OKLab. Constants from Björn Ottosson's OKLab definition. */
export function rgbToOklab(r: number, g: number, b: number): OKLab {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

export function oklabToOklch({ L, a, b }: OKLab): OKLCH {
  return {
    L,
    C: Math.hypot(a, b),
    h: (Math.atan2(b, a) * DEG + 360) % 360,
  };
}

export function rgbToOklch(r: number, g: number, b: number): OKLCH {
  return oklabToOklch(rgbToOklab(r, g, b));
}

/** OKLCH -> raw (unclamped) sRGB channels in [0,1]; out-of-gamut values escape [0,1]. */
function oklchToSrgbRaw(L: number, C: number, h: number): RGB {
  const rad = h / DEG;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

function isInGamut(L: number, C: number, h: number): boolean {
  const { r, g, b } = oklchToSrgbRaw(L, C, h);
  const e = 0.0008;
  return (
    r >= -e && r <= 1 + e
    && g >= -e && g <= 1 + e
    && b >= -e && b <= 1 + e
  );
}

/**
 * Largest chroma <= `C` that stays inside the sRGB gamut at the given L and h.
 * Keeps hue and lightness fixed (the perceptually important axes) and only
 * trims saturation, which is how OKLCH gamut mapping preserves colour identity.
 */
export function clampChromaToGamut(L: number, C: number, h: number): number {
  if (isInGamut(L, C, h)) return C;

  let lo = 0;
  let hi = C;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (isInGamut(L, mid, h)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function oklchToHex(L: number, C: number, h: number): string {
  const { r, g, b } = oklchToSrgbRaw(L, C, h);
  const to = (v: number): string =>
    Math.min(Math.max(Math.round(v * 255), 0), 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
