import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/vue";
import { createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { VueQueryPlugin } from "@tanstack/vue-query";
import type { LibraryItem } from "@/modules/library/types";
import { canOpenLibraryMenu } from "@/modules/library/composables/useLibraryMenu";
import LibraryContextMenu from "../LibraryContextMenu.vue";

//
// The reka trigger opens the shell on right-click on its own; when the menu
// cannot be filled (off-row, or a catalog artist that has no actions) the
// event has to be stopped in the capture phase, or an empty popup shows up.
// The guard lives in the template on purpose — bound through the composable
// it silently never attached, which is what left the popup empty.
//

vi.mock("@/modules/library/composables/useLibrary", () => ({
  useLibrary: () => ({ togglePin: vi.fn(), createPlaylist: vi.fn() }),
}));
vi.mock("@/modules/library/composables/useLibraryContextActions", () => ({
  useLibraryContextActions: () => ({
    addToQueue: vi.fn(),
    addCatalogToQueue: vi.fn(),
    downloadCatalog: vi.fn(),
  }),
}));
vi.mock("@/lib/environment/userAgent", () => ({ IS_TAURI: true, IS_MOBILE: false, IS_WINDOWS: false }));

function mountMenu() {
  const i18n = createI18n({
    legacy: false,
    locale: "en",
    messages: { en: {} },
    missingWarn: false,
    fallbackWarn: false,
  });

  render(LibraryContextMenu, {
    global: {
      plugins: [createPinia(), VueQueryPlugin, i18n],
      stubs: { ContextMenuCloseBridge: true },
    },
    slots: {
      default: "<div><div data-library-item data-testid=\"row\">row</div>"
        + "<div data-library-item data-library-menu=\"none\" data-testid=\"blocked\">blocked</div>"
        + "<div data-testid=\"offrow\">off</div></div>",
    },
  });
}

function rightClick(el: HTMLElement) {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

// reka's touch long-press timer starts from pointerdown and never sees the
// contextmenu guard — the guard must cancel the pointerdown itself. jsdom has
// no PointerEvent constructor, so fake the pointerType on a MouseEvent.
const pressWith = (el: HTMLElement, pointerType: string) => {
  const event = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  el.dispatchEvent(event);
  return event;
};

function item(type: LibraryItem["type"], isCatalog: boolean): LibraryItem {
  return {
    id: `nd:${type}1`,
    type,
    title: "Catalog row",
    isPinned: false,
    isCatalog,
    addedAt: 0,
    to: "/",
    rounded: false,
  };
}

describe("LibraryContextMenu", () => {
  it("stops right-clicks that cannot fill the menu", () => {
    mountMenu();

    expect(rightClick(screen.getByTestId("blocked")).defaultPrevented).toBe(true);
    expect(rightClick(screen.getByTestId("offrow")).defaultPrevented).toBe(true);
  });

  it("lets a row with a menu through", () => {
    mountMenu();

    expect(rightClick(screen.getByTestId("row")).defaultPrevented).toBe(false);
  });

  it("cancels touch long-presses that cannot fill the menu", () => {
    mountMenu();

    expect(pressWith(screen.getByTestId("offrow"), "touch").defaultPrevented).toBe(true);
    expect(pressWith(screen.getByTestId("blocked"), "touch").defaultPrevented).toBe(true);
    expect(pressWith(screen.getByTestId("blocked"), "pen").defaultPrevented).toBe(true);
  });

  it("keeps touch long-press alive on rows and never touches mouse presses", () => {
    mountMenu();

    expect(pressWith(screen.getByTestId("row"), "touch").defaultPrevented).toBe(false);
    expect(pressWith(screen.getByTestId("offrow"), "mouse").defaultPrevented).toBe(false);
  });
});

describe("canOpenLibraryMenu", () => {
  it("refuses catalog artists and allows catalog albums/playlists", () => {
    expect(canOpenLibraryMenu(item("artist", true))).toBe(false);
    expect(canOpenLibraryMenu(item("album", true))).toBe(true);
    expect(canOpenLibraryMenu(item("playlist", true))).toBe(true);
  });

  it("allows every library row", () => {
    expect(canOpenLibraryMenu(item("artist", false))).toBe(true);
  });
});
