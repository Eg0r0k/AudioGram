import { defineComponent } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithPlugins, screen, waitFor } from "@/test/utils";
import NuxtImage from "../NuxtImage.vue";

function mockImageDecode(decode: () => Promise<void>) {
  class MockImage {
    crossOrigin = "";
    sizes = "";
    srcset = "";
    src = "";

    decode = vi.fn(decode);
  }

  vi.stubGlobal("Image", MockImage);
}

function mockImageWithoutDecodeSyncLoad() {
  class MockImage {
    crossOrigin = "";
    sizes = "";
    srcset = "";
    onload: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    private currentSrc = "";

    get src() {
      return this.currentSrc;
    }

    set src(value: string) {
      this.currentSrc = value;
      this.onload?.(new Event("load"));
    }
  }

  vi.stubGlobal("Image", MockImage);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NuxtImage", () => {
  it("renders a valid image with accessible attributes", () => {
    renderWithPlugins(NuxtImage, {
      props: {
        src: "/covers/album.png",
        alt: "Album cover",
        width: 128,
        height: 128,
        loading: "eager",
      },
    });

    const image = screen.getByRole("img", { name: "Album cover" });

    expect(image).toHaveAttribute("src", "/covers/album.png");
    expect(image).toHaveAttribute("width", "128");
    expect(image).toHaveAttribute("height", "128");
    expect(image).toHaveAttribute("loading", "eager");
  });

  it("uses the fallback source for an invalid image source", () => {
    renderWithPlugins(NuxtImage, {
      props: {
        src: " ",
        fallbackSrc: "/img/fallback.svg",
        alt: "Fallback cover",
      },
    });

    expect(screen.getByRole("img", { name: "Fallback cover" })).toHaveAttribute(
      "src",
      "/img/fallback.svg",
    );
  });

  it("does not keep responsive sources when rendering fallback", () => {
    renderWithPlugins(NuxtImage, {
      props: {
        src: " ",
        fallbackSrc: "/img/fallback.svg",
        srcset: "/covers/broken-2x.png 2x",
        sizes: "64px",
        alt: "Fallback cover",
      },
    });

    const image = screen.getByRole("img", { name: "Fallback cover" });

    expect(image).toHaveAttribute("src", "/img/fallback.svg");
    expect(image).not.toHaveAttribute("srcset");
    expect(image).not.toHaveAttribute("sizes");
  });

  it("does not apply placeholder styling when an invalid source falls back immediately", () => {
    renderWithPlugins(NuxtImage, {
      props: {
        src: " ",
        fallbackSrc: "/img/fallback.svg",
        alt: "Fallback cover",
        placeholder: true,
        placeholderClass: "blur-sm",
      },
    });

    const image = screen.getByRole("img", { name: "Fallback cover" });

    expect(image).toHaveAttribute("src", "/img/fallback.svg");
    expect(image).not.toHaveClass("blur-sm");
  });

  it("marks custom images as loaded when the preload image fires load without decode support", async () => {
    mockImageWithoutDecodeSyncLoad();

    const CustomImage = defineComponent({
      components: { NuxtImage },
      template: `
        <NuxtImage src="/covers/album.png" custom v-slot="{ imgAttrs, isLoaded, src }">
          <img v-bind="imgAttrs" :src="src" :data-loaded="String(isLoaded)" alt="Album cover">
        </NuxtImage>
      `,
    });

    renderWithPlugins(CustomImage);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Album cover" })).toHaveAttribute("data-loaded", "true");
    });
  });

  it("renders the fallback as loaded when a custom image preload fails", async () => {
    mockImageDecode(() => Promise.reject(new Error("decode failed")));

    const CustomImage = defineComponent({
      components: { NuxtImage },
      template: `
        <NuxtImage
          src="/covers/missing.png"
          fallback-src="/img/fallback.svg"
          custom
          v-slot="{ imgAttrs, isLoaded, src }"
        >
          <img v-bind="imgAttrs" :src="src" :data-loaded="String(isLoaded)" alt="Album cover">
        </NuxtImage>
      `,
    });

    renderWithPlugins(CustomImage);

    const image = screen.getByRole("img", { name: "Album cover" });

    await waitFor(() => {
      expect(image).toHaveAttribute("src", "/img/fallback.svg");
      expect(image).toHaveAttribute("data-loaded", "true");
    });
  });

  it("stops applying placeholder styling after falling back", async () => {
    mockImageDecode(() => Promise.reject(new Error("decode failed")));

    renderWithPlugins(NuxtImage, {
      props: {
        src: "/covers/missing.png",
        fallbackSrc: "/img/fallback.svg",
        alt: "Album cover",
        placeholder: true,
        placeholderClass: "blur-sm",
      },
    });

    const image = screen.getByRole("img", { name: "Album cover" });

    await waitFor(() => {
      expect(image).toHaveAttribute("src", "/img/fallback.svg");
      expect(image).not.toHaveClass("blur-sm");
    });
  });
});
