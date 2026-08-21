import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useTouchContextMenuGuard } from "../useTouchContextMenuGuard";

// happy-dom не имеет конструктора PointerEvent с pointerType — фейкаем на MouseEvent.
const pressWith = (el: HTMLElement, pointerType: string): MouseEvent => {
  const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  el.dispatchEvent(event);
  return event;
};

const rightClick = (el: HTMLElement): MouseEvent => {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
};

// useEventListener registers via a flush:"post" watcher, which resolves in a
// microtask — the listeners aren't attached yet on the tick mount() returns,
// so every case awaits a nextTick() before dispatching.
const mountGuard = async () => {
  const Host = defineComponent(() => {
    const guardRef = ref<HTMLElement | null>(null);
    useTouchContextMenuGuard(
      guardRef,
      target => !!target.closest("[data-track-row]"),
    );
    return () => h("div", { ref: guardRef }, [
      h("div", { "data-track-row": "", "data-testid": "row" }),
      h("div", { "data-testid": "offrow" }),
    ]);
  });

  const wrapper = mount(Host, { attachTo: document.body });
  await nextTick();
  return {
    wrapper,
    row: wrapper.get("[data-testid='row']").element as HTMLElement,
    offrow: wrapper.get("[data-testid='offrow']").element as HTMLElement,
  };
};

describe("useTouchContextMenuGuard", () => {
  it("cancels touch pointerdown on a track row so reka never arms its long-press timer", async () => {
    const { wrapper, row } = await mountGuard();
    expect(pressWith(row, "touch").defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it("keeps mouse pointerdown on a row untouched", async () => {
    const { wrapper, row } = await mountGuard();
    expect(pressWith(row, "mouse").defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it("blocks the contextmenu event that follows a touch press on a row", async () => {
    const { wrapper, row } = await mountGuard();
    pressWith(row, "touch");
    expect(rightClick(row).defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it("lets a mouse right-click on a row open the menu", async () => {
    const { wrapper, row } = await mountGuard();
    pressWith(row, "mouse");
    expect(rightClick(row).defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it("still blocks contextmenu outside fillable targets regardless of pointer", async () => {
    const { wrapper, offrow } = await mountGuard();
    pressWith(offrow, "mouse");
    expect(rightClick(offrow).defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it("cancels touch pointerdown outside fillable targets (old guard behaviour)", async () => {
    const { wrapper, offrow } = await mountGuard();
    expect(pressWith(offrow, "touch").defaultPrevented).toBe(true);
    wrapper.unmount();
  });
});
