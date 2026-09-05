import { afterEach, describe, expect, it, vi } from "vitest";
import { MotionGlobalConfig } from "motion-utils";
import { installReducedMotion, REDUCED_MOTION_QUERY } from "../reduced-motion";

const fakeMatchMedia = (matches: boolean) => {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    addEventListener: vi.fn((_: string, cb: () => void) => listeners.add(cb)),
    removeEventListener: vi.fn((_: string, cb: () => void) => listeners.delete(cb)),
  };
  const matchMediaMock = vi.fn((query: string) => {
    expect(query).toBe(REDUCED_MOTION_QUERY);
    return media as unknown as MediaQueryList;
  });
  vi.stubGlobal("matchMedia", matchMediaMock);
  return {
    media,
    flip: (next: boolean) => {
      media.matches = next;
      listeners.forEach(cb => cb());
    },
  };
};

describe("installReducedMotion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    MotionGlobalConfig.skipAnimations = false;
  });

  it("mirrors the OS preference into MotionGlobalConfig.skipAnimations", () => {
    fakeMatchMedia(true);

    installReducedMotion();

    expect(MotionGlobalConfig.skipAnimations).toBe(true);
  });

  it("follows live changes of the preference until uninstalled", () => {
    const { media, flip } = fakeMatchMedia(false);

    const uninstall = installReducedMotion();
    expect(MotionGlobalConfig.skipAnimations).toBe(false);

    flip(true);
    expect(MotionGlobalConfig.skipAnimations).toBe(true);

    uninstall();
    expect(media.removeEventListener).toHaveBeenCalledTimes(1);
    flip(false);
    expect(MotionGlobalConfig.skipAnimations).toBe(true);
  });

  it("is a no-op without matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(() => installReducedMotion()()).not.toThrow();
    expect(MotionGlobalConfig.skipAnimations).toBe(false);
  });
});
