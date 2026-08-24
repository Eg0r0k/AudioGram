import { beforeAll, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { defineComponent, h } from "vue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "..";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../../context-menu";
import { useOverlayBackButton } from "@/composables/useOverlayBackButton";

//
// Android's hardware back must dismiss an open menu. Only surfaces that
// register with the overlay coordinator are offered the press; anything else
// falls through to the shell, which minimises the app with the menu still up.
// The shell asks the page over a native bridge — these tests stand in for it.
//

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

// The global setup stubs teleport, which would swallow the portaled content.
const renderOptions = { global: { stubs: { teleport: false } } };

const pressNativeBack = () => {
  window.dispatchEvent(new CustomEvent("audiogram-back"));
};

const DropdownHost = defineComponent({
  setup() {
    useOverlayBackButton();
    return () => h(DropdownMenu, null, {
      default: () => [
        h(DropdownMenuTrigger, null, { default: () => "open dropdown" }),
        h(DropdownMenuContent, null, {
          default: () => h(DropdownMenuItem, null, { default: () => "dropdown item" }),
        }),
      ],
    });
  },
});

const ContextHost = defineComponent({
  setup() {
    useOverlayBackButton();
    return () => h(ContextMenu, null, {
      default: () => [
        h(ContextMenuTrigger, null, { default: () => "context target" }),
        h(ContextMenuContent, null, {
          default: () => h(ContextMenuItem, null, { default: () => "context item" }),
        }),
      ],
    });
  },
});

describe("menus and the hardware back button", () => {
  it("claims the press while a dropdown is open, and closes it", async () => {
    const depths: number[] = [];
    window.AudiogramBack = { setOverlayDepth: d => depths.push(d) };
    try {
      render(DropdownHost, renderOptions);
      expect(depths.at(-1)).toBe(0);

      await userEvent.click(screen.getByText("open dropdown"));
      await screen.findByText("dropdown item");
      // Claiming the press is what stops the shell from minimising the app.
      await waitFor(() => expect(depths.at(-1)).toBe(1));

      pressNativeBack();

      await waitFor(() => expect(screen.queryByText("dropdown item")).toBeNull());
      await waitFor(() => expect(depths.at(-1)).toBe(0));
    }
    finally {
      delete window.AudiogramBack;
    }
  });

  it("claims the press while a context menu is open, and closes it", async () => {
    const depths: number[] = [];
    window.AudiogramBack = { setOverlayDepth: d => depths.push(d) };
    try {
      render(ContextHost, renderOptions);

      await userEvent.pointer({ keys: "[MouseRight]", target: screen.getByText("context target") });
      await screen.findByText("context item");
      await waitFor(() => expect(depths.at(-1)).toBe(1));

      pressNativeBack();

      await waitFor(() => expect(screen.queryByText("context item")).toBeNull());
      await waitFor(() => expect(depths.at(-1)).toBe(0));
    }
    finally {
      delete window.AudiogramBack;
    }
  });

  it("claims nothing while the menu is closed", () => {
    const depths: number[] = [];
    window.AudiogramBack = { setOverlayDepth: d => depths.push(d) };
    try {
      render(DropdownHost, renderOptions);
      // A press the shell must handle itself: router back, or leaving the app.
      expect(depths.at(-1)).toBe(0);
    }
    finally {
      delete window.AudiogramBack;
    }
  });
});
