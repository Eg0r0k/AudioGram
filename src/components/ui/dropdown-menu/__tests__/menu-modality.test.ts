import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { defineComponent, h, ref } from "vue";
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

//
// Menus must be MODAL: while one is open, reka disables pointer events on
// the body, so the first outside click lands nowhere — it only dismisses the
// menu (Telegram-style), never activates the element under the cursor.
// TrackDropdown & co. used to pass :modal="false", which allowed click-through.
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

const DropdownHost = defineComponent({
  setup() {
    const open = ref(false);
    return () => h(DropdownMenu, {
      "open": open.value,
      "onUpdate:open": (value: boolean) => {
        open.value = value;
      },
    }, {
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

describe("menu modality (click-through prevention)", () => {
  // The global test setup stubs teleport, which would swallow the portaled
  // menu content — restore the real one here.
  const renderOptions = { global: { stubs: { teleport: false } } };

  it("dropdown menus disable body pointer events while open", async () => {
    render(DropdownHost, renderOptions);

    await userEvent.click(screen.getByText("open dropdown"));
    await screen.findByText("dropdown item");

    expect(document.body.style.pointerEvents).toBe("none");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByText("dropdown item")).toBeNull();
    });
    await waitFor(() => {
      expect(document.body.style.pointerEvents).not.toBe("none");
    });
  });

  it("context menus disable body pointer events while open", async () => {
    render(ContextHost, renderOptions);

    await fireEvent.contextMenu(screen.getByText("context target"));
    await screen.findByText("context item");

    expect(document.body.style.pointerEvents).toBe("none");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByText("context item")).toBeNull();
    });
    await waitFor(() => {
      expect(document.body.style.pointerEvents).not.toBe("none");
    });
  });
});
