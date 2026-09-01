import { beforeEach, describe, expect, it, vi } from "vitest";

const caps = vi.hoisted(() => ({ canShellSpawn: true }));
vi.mock("@/lib/environment/platformCaps", () => ({ platformCaps: caps }));

import { setMediaServerBaseForTests } from "@/lib/stream-url";
import { THUMB_SIZE_ROW } from "@/lib/media/cover-sizes";
import { proxiedThumbnail, unproxiedThumbnail } from "../lib/thumbnail";

const BASE = "http://127.0.0.1:4321/tokentokentokentokentokentokento";
const COVER = "https://lh3.googleusercontent.com/cover=w120-h120-l90-rj";
const SHARP_ROW = "https://lh3.googleusercontent.com/cover=w226-h226-l90-rj";

beforeEach(() => {
  caps.canShellSpawn = true;
  setMediaServerBaseForTests(BASE);
});

describe("proxiedThumbnail", () => {
  it("upscales the CDN rendition and routes it through the ytimg route", () => {
    expect(proxiedThumbnail(COVER, THUMB_SIZE_ROW))
      .toBe(`${BASE}/ytimg/${encodeURIComponent(SHARP_ROW)}`);
  });

  it("returns the sharp URL untouched where the route does not exist", () => {
    caps.canShellSpawn = false;
    expect(proxiedThumbnail(COVER, THUMB_SIZE_ROW)).toBe(SHARP_ROW);
  });
});

describe("unproxiedThumbnail", () => {
  it("round-trips through proxiedThumbnail", () => {
    expect(unproxiedThumbnail(proxiedThumbnail(COVER, THUMB_SIZE_ROW))).toBe(SHARP_ROW);
  });

  it("passes plain URLs through and rejects non-URLs", () => {
    expect(unproxiedThumbnail(SHARP_ROW)).toBe(SHARP_ROW);
    expect(unproxiedThumbnail(`${BASE}/yt/dQw4w9WgXcQ`)).toBe(`${BASE}/yt/dQw4w9WgXcQ`);
    expect(unproxiedThumbnail("not a url")).toBeNull();
    expect(unproxiedThumbnail(null)).toBeNull();
  });
});
