import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";

vi.mock("@/lib/environment/touchSupport", () => ({ default: true }));
vi.mock("@/lib/environment/userAgent", () => ({ IS_ANDROID: true, IS_APP: true }));

import { usePreventPinchZoom } from "../usePreventPinchZoom";

const INDEX_HTML_VIEWPORT
  = "width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content";

describe("usePreventPinchZoom (Android app)", () => {
  let meta: HTMLMetaElement;
  const wrappers: VueWrapper[] = [];

  const mountWith = (isDisabled?: boolean) => {
    const wrapper = mount(defineComponent({
      setup: () => {
        usePreventPinchZoom(isDisabled);
        return () => null;
      },
    }));
    wrappers.push(wrapper);
    return wrapper;
  };

  beforeEach(() => {
    meta = document.createElement("meta");
    meta.setAttribute("name", "viewport");
    meta.setAttribute("content", INDEX_HTML_VIEWPORT);
    document.head.appendChild(meta);
  });

  afterEach(() => {
    while (wrappers.length > 0) wrappers.pop()?.unmount();
    meta.remove();
  });

  it("keeps the keyboard-aware viewport while locking pinch zoom", () => {
    mountWith();

    const content = meta.getAttribute("content") ?? "";
    expect(content).toContain("user-scalable=no");
    expect(content).toContain("interactive-widget=resizes-content");
    expect(content).toContain("viewport-fit=cover");
  });

  it("keeps the keyboard-aware viewport when zoom is re-enabled", () => {
    mountWith(true);

    const content = meta.getAttribute("content") ?? "";
    expect(content).not.toContain("user-scalable=no");
    expect(content).toContain("interactive-widget=resizes-content");
  });

  it("restores the original keyboard-aware viewport on cleanup", () => {
    const wrapper = mountWith();
    wrapper.unmount();

    expect(meta.getAttribute("content")).toBe(INDEX_HTML_VIEWPORT);
  });
});
