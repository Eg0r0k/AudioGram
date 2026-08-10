import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, shallowRef, type Ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import {
  ContextMenu,
  ContextMenuCloseBridge,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useMenuCursorAutoClose } from "@/composables/useMenuCursorAutoClose";


const CONTENT_SELECTOR = "[data-slot=\"context-menu-content\"]";
const TRIGGER_SELECTOR = "[data-slot=\"context-menu-trigger\"]";

function moveMouse(clientX: number, clientY: number) {
  document.dispatchEvent(new MouseEvent("mousemove", { clientX, clientY, bubbles: true }));
}

function triggerState() {
  return document.querySelector(TRIGGER_SELECTOR)?.getAttribute("data-state");
}

function createFakeContentLayer(rect: { left: number; top: number; width: number; height: number }) {
  const el = document.createElement("div");
  el.setAttribute("data-slot", "context-menu-content");
  el.getBoundingClientRect = () =>
    new DOMRect(rect.left, rect.top, rect.width, rect.height);
  document.body.appendChild(el);
  return el;
}

async function openViaRightClick() {
  const trigger = document.querySelector(TRIGGER_SELECTOR);
  if (!trigger) throw new Error("trigger not rendered");
  trigger.dispatchEvent(new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 10,
    clientY: 10,
  }));
  await nextTick();
  await nextTick();
}

function mountRealMenu(): { isOpen: Ref<boolean>; wrapper: VueWrapper } {
  const isOpen = shallowRef(false);

  const Host = defineComponent({
    setup() {
      useMenuCursorAutoClose(isOpen, () => {
        isOpen.value = false;
      }, { contentSelector: CONTENT_SELECTOR });

      return () => h(ContextMenu, {
        "onUpdate:open": (value: boolean) => {
          isOpen.value = value;
        },
      }, {
        default: () => [
          h(ContextMenuCloseBridge, { open: isOpen.value }),
          h(ContextMenuTrigger, null, { default: () => h("div", "target") }),
          h(ContextMenuContent, null, {
            default: () => h(ContextMenuItem, null, { default: () => "item" }),
          }),
        ],
      });
    },
  });

  const wrapper = mount(Host, { attachTo: document.body });
  return { isOpen, wrapper };
}

describe("useMenuCursorAutoClose + ContextMenuCloseBridge (интеграция)", () => {
  let wrapper: VueWrapper | undefined;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    document.querySelectorAll(CONTENT_SELECTOR).forEach(el => el.remove());
  });

  it("правый клик открывает меню и синхронизирует состояние наружу", async () => {
    const mounted = mountRealMenu();
    wrapper = mounted.wrapper;

    expect(triggerState()).toBe("closed");
    await openViaRightClick();

    expect(mounted.isOpen.value).toBe(true);
    expect(triggerState()).toBe("open");
  });

  it("программное закрытие через мост реально закрывает reka-меню", async () => {
    const mounted = mountRealMenu();
    wrapper = mounted.wrapper;

    await openViaRightClick();
    expect(triggerState()).toBe("open");

    mounted.isOpen.value = false;
    await nextTick();
    await nextTick();

    expect(triggerState()).toBe("closed");
  });

  it("курсор далеко от контента → закрывается и внешнее состояние, и reka", async () => {
    const mounted = mountRealMenu();
    wrapper = mounted.wrapper;

    await openViaRightClick();
    createFakeContentLayer({ left: 100, top: 100, width: 200, height: 200 });

    moveMouse(500, 500);
    await nextTick();
    await nextTick();

    expect(mounted.isOpen.value).toBe(false);
    expect(triggerState()).toBe("closed");
  });

  it("курсор рядом с контентом → меню остаётся открытым", async () => {
    const mounted = mountRealMenu();
    wrapper = mounted.wrapper;

    await openViaRightClick();
    createFakeContentLayer({ left: 100, top: 100, width: 200, height: 200 });

    moveMouse(200, 200);
    await nextTick();

    expect(mounted.isOpen.value).toBe(true);
    expect(triggerState()).toBe("open");
  });
});
