import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, shallowRef } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { useMenuCursorAutoClose } from "@/composables/useMenuCursorAutoClose";

const SELECTOR = "[data-slot=\"context-menu-content\"]";

function createMenuLayer(rect: { left: number; top: number; width: number; height: number }) {
  const el = document.createElement("div");
  el.setAttribute("data-slot", "context-menu-content");
  el.getBoundingClientRect = () =>
    new DOMRect(rect.left, rect.top, rect.width, rect.height);
  document.body.appendChild(el);
  return el;
}

function moveMouse(clientX: number, clientY: number) {
  document.dispatchEvent(new MouseEvent("mousemove", { clientX, clientY, bubbles: true }));
}

function mountCursorAutoClose(isOpenInitial = true) {
  const isOpen = shallowRef(isOpenInitial);
  const close = vi.fn();
  const wrapper = mount(defineComponent({
    setup() {
      useMenuCursorAutoClose(isOpen, close, { contentSelector: SELECTOR });
      return () => h("div");
    },
  }));
  return { isOpen, close, wrapper };
}

describe("useMenuCursorAutoClose", () => {
  let wrapper: VueWrapper | undefined;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    document.querySelectorAll(SELECTOR).forEach(el => el.remove());
  });

  const RECT = { left: 100, top: 100, width: 200, height: 200 };

  it("не закрывает, пока курсор внутри меню", () => {
    createMenuLayer(RECT);
    const { close, wrapper: w } = mountCursorAutoClose();
    wrapper = w;

    moveMouse(200, 200);
    expect(close).not.toHaveBeenCalled();
  });

  it("не закрывает внутри буферной зоны (< 100px от грани)", () => {
    createMenuLayer(RECT);
    const { close, wrapper: w } = mountCursorAutoClose();
    wrapper = w;

    moveMouse(399, 200); 
    moveMouse(200, 1); 
    expect(close).not.toHaveBeenCalled();
  });

  it("закрывает, когда курсор дальше порога от меню", () => {
    createMenuLayer(RECT);
    const { close, wrapper: w } = mountCursorAutoClose();
    wrapper = w;

    moveMouse(400, 200); 
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("учитывает диагональ по осям, а не евклидово расстояние", () => {
    createMenuLayer(RECT);
    const { close, wrapper: w } = mountCursorAutoClose();
    wrapper = w;

    moveMouse(390, 390);
    expect(close).not.toHaveBeenCalled();
  });

  it("не закрывает при закрытом меню", () => {
    createMenuLayer(RECT);
    const { close, wrapper: w } = mountCursorAutoClose(false);
    wrapper = w;

    moveMouse(1000, 1000);
    expect(close).not.toHaveBeenCalled();
  });

  it("не закрывает, пока контент меню не смонтирован", () => {
    const { close, wrapper: w } = mountCursorAutoClose();
    wrapper = w;

    moveMouse(1000, 1000);
    expect(close).not.toHaveBeenCalled();
  });

  it("не закрывает, если курсор рядом с сабменю, но далеко от корневого слоя", () => {
    createMenuLayer(RECT);
    createMenuLayer({ left: 500, top: 100, width: 200, height: 200 });
    const { close, wrapper: w } = mountCursorAutoClose();
    wrapper = w;

    moveMouse(600, 200);
    expect(close).not.toHaveBeenCalled();
  });

  it("закрывает, когда курсор далеко от всех слоёв", () => {
    createMenuLayer(RECT);
    createMenuLayer({ left: 500, top: 100, width: 200, height: 200 });
    const { close, wrapper: w } = mountCursorAutoClose();
    wrapper = w;

    moveMouse(600, 600);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("снимает слушатель после размонтирования", () => {
    createMenuLayer(RECT);
    const { close, wrapper: w } = mountCursorAutoClose();
    wrapper = w;

    w.unmount();
    moveMouse(1000, 1000);
    expect(close).not.toHaveBeenCalled();
  });
});
