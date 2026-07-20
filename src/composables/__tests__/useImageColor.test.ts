import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OKLCH } from "@/lib/color/color";

// Mock the analyser so orchestration is deterministic without a real canvas.
const { analyzeWithCanvas } = vi.hoisted(() => ({
  analyzeWithCanvas: vi.fn<(url: string) => Promise<OKLCH | null>>(),
}));

vi.mock("@/lib/color/canvas-analyzer", () => ({ analyzeWithCanvas }));

import { getColorFromImage, useImageColor } from "../useImageColor";

// Raw extracted OKLCH values and the hex the vivid adjustment produces.
const BLUE: OKLCH = { L: 0.5324825595, C: 0.1678655044, h: 262.293047 };
const BLUE_HEX = "#2465ea";
const RED: OKLCH = { L: 0.532, C: 0.145, h: 28.5434 };
const RED_HEX = "#c92f26";

beforeEach(() => {
  analyzeWithCanvas.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getColorFromImage", () => {
  it("adjusts the extracted accent, keeping it vivid and matching the cover", async () => {
    analyzeWithCanvas.mockResolvedValue(BLUE);

    const result = await getColorFromImage("blob:cover");

    expect(result.hex).toBe(BLUE_HEX);
    expect(result.rgb).toBe("rgb(36, 101, 234)");
    expect(result.hsl).toBe("hsl(220, 82%, 53%)");
    expect(result.isDark).toBe(false);
  });

  it("returns the fallback colour when extraction yields nothing", async () => {
    analyzeWithCanvas.mockResolvedValue(null);

    const result = await getColorFromImage("blob:cover");

    expect(result.hex).toBe("#535353");
  });

  it("honours a custom fallback colour", async () => {
    analyzeWithCanvas.mockResolvedValue(null);

    const result = await getColorFromImage("blob:cover", { fallback: "#123456" });

    expect(result.hex).toBe("#123456");
  });
});

describe("useImageColor", () => {
  it("starts with the fallback colour and idle state", () => {
    const { color, isLoading, error } = useImageColor();
    expect(color.value.hex).toBe("#535353");
    expect(isLoading.value).toBe(false);
    expect(error.value).toBeNull();
  });

  it("toggles isLoading around extraction and stores the result", async () => {
    analyzeWithCanvas.mockResolvedValue(BLUE);
    const { color, isLoading, extractColor } = useImageColor();

    const p = extractColor("blob:cover");
    expect(isLoading.value).toBe(true);
    await p;
    expect(isLoading.value).toBe(false);
    expect(color.value.hex).toBe(BLUE_HEX);
  });

  it("resetColor restores the fallback and clears error", async () => {
    analyzeWithCanvas.mockResolvedValue(BLUE);
    const { color, error, extractColor, resetColor } = useImageColor();

    await extractColor("blob:cover");
    expect(color.value.hex).toBe(BLUE_HEX);

    resetColor();
    expect(color.value.hex).toBe("#535353");
    expect(error.value).toBeNull();
  });

  it("degrades to the fallback when extraction fails (no error surfaced)", async () => {
    analyzeWithCanvas.mockResolvedValue(null);
    const { color, error, extractColor } = useImageColor();

    await extractColor("blob:cover");

    expect(error.value).toBeNull();
    expect(color.value.hex).toBe("#535353");
  });

  // The request guard: when extractions overlap, the LAST requested cover wins
  // regardless of settle order, so a slow older cover can never clobber it.
  it("the newest requested cover wins even if an older one settles later", async () => {
    const resolvers: Array<(v: OKLCH | null) => void> = [];
    analyzeWithCanvas.mockImplementation(
      () => new Promise<OKLCH | null>((resolve) => {
        resolvers.push(resolve);
      }),
    );

    const { color, extractColor } = useImageColor();

    const first = extractColor("blob:old"); // requested first, resolves LAST
    const second = extractColor("blob:new"); // requested last, resolves FIRST

    resolvers[1](RED); // newer cover finishes first
    await second;
    expect(color.value.hex).toBe(RED_HEX);

    resolvers[0](BLUE); // older cover finishes later — must be ignored
    await first;
    expect(color.value.hex).toBe(RED_HEX);
  });
});
