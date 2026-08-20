import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { renderWithPlugins } from "@/test/utils";
import NuxtImage from "../ui/image/NuxtImage.vue";

const SRC = "/covers/test.png";

/**
 * Preload probes are `new Image()` instances. A memory-cached image reports
 * `complete` synchronously right after the src assignment — that is the state
 * the mount-time cache check relies on to skip the placeholder frame.
 */
const stubImage = ({ cached }: { cached: boolean }) => {
  class FakeImage {
    complete = false;
    naturalWidth = 0;
    crossOrigin = "";
    sizes = "";
    srcset = "";
    onload: ((e: Event) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    #src = "";

    get src() {
      return this.#src;
    }

    set src(value: string) {
      this.#src = value;
      if (cached) {
        this.complete = true;
        this.naturalWidth = 100;
      }
    }

    decode() {
      return cached ? Promise.resolve() : new Promise<void>(() => {});
    }
  }
  vi.stubGlobal("Image", FakeImage);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NuxtImage placeholder mode", () => {
  // The success flag flips synchronously inside onMounted, so the swap to the
  // real src lands in the same pre-paint flush — one nextTick in the test.
  it("renders a cached image immediately, without a placeholder frame", async () => {
    stubImage({ cached: true });

    const { container } = renderWithPlugins(NuxtImage, {
      props: { src: SRC, placeholder: true, alt: "" },
    });
    await nextTick();

    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(SRC);
  });

  it("shows the placeholder while a non-cached image is loading", async () => {
    stubImage({ cached: false });

    const { container } = renderWithPlugins(NuxtImage, {
      props: { src: SRC, placeholder: true, alt: "" },
    });
    await nextTick();

    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  });
});
