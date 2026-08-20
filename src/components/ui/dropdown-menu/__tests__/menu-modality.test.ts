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

  //
  // The body pointer-events lock alone is not enough: elements with an
  // explicit pointer-events:auto stay clickable THROUGH the layers above
  // them. A scrim in the menu portal (below the content, above everything
  // else) catches the outside click instead; it must survive until the body
  // lock is actually released, then leave.
  //

  it("dropdown renders a hit-testable scrim under the content and removes it after close", async () => {
    render(DropdownHost, renderOptions);

    await userEvent.click(screen.getByText("open dropdown"));
    await screen.findByText("dropdown item");

    const scrim = document.querySelector('[data-slot="menu-overlay"]');
    expect(scrim).not.toBeNull();
    expect(scrim!.className).toContain("pointer-events-auto");

    const content = screen.getByText("dropdown item")
      .closest('[data-slot="dropdown-menu-content"]');
    expect(scrim!.compareDocumentPosition(content!) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.body.style.pointerEvents).not.toBe("none");
    });
    await waitFor(() => {
      expect(document.querySelector('[data-slot="menu-overlay"]')).toBeNull();
    });
  });

  it("context menu renders the scrim while open and removes it after close", async () => {
    render(ContextHost, renderOptions);

    await fireEvent.contextMenu(screen.getByText("context target"));
    await screen.findByText("context item");

    expect(document.querySelector('[data-slot="menu-overlay"]')).not.toBeNull();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(document.body.style.pointerEvents).not.toBe("none");
    });
    await waitFor(() => {
      expect(document.querySelector('[data-slot="menu-overlay"]')).toBeNull();
    });
  });
});
