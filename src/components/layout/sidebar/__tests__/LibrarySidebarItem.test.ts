/* eslint-disable @typescript-eslint/no-explicit-any */
import { fireEvent, render, screen } from "@testing-library/vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import type { LibraryItem } from "@/modules/library/types";
import LibrarySidebarItem from "../library-item/LibrarySidebarItem.vue";

const openMenuMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/library/composables/useLibraryMenu", () => ({
  canOpenLibraryMenu: () => true,
  useLibraryMenu: () => ({ openMenu: openMenuMock }),
}));

vi.mock("@/db/repositories", () => ({
  trackRepository: { findByIds: vi.fn() },
}));

const slotStub = { template: "<div><slot /></div>" };
const stubs = {
  NuxtImage: true,
  EntityCoverImage: true,
  TooltipProvider: slotStub,
  Tooltip: slotStub,
  TooltipTrigger: slotStub,
  TooltipContent: true,
};

const createItem = (overrides: Partial<LibraryItem> = {}): LibraryItem => ({
  id: "p1",
  type: "playlist",
  title: "Road Trip",
  subtitle: "12 tracks",
  isPinned: false,
  addedAt: 0,
  to: "/playlist/p1",
  rounded: false,
  ...overrides,
});

let router: Router;

const renderItem = async (item: LibraryItem, compact = false) => {
  const utils = render(LibrarySidebarItem, {
    props: { item, compact },
    global: {
      plugins: [createPinia(), i18n, router],
      stubs,
      directives: { ripple: {} },
    },
  });
  await router.isReady();
  return utils;
};

describe("LibrarySidebarItem", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }],
    });
    await router.push("/");
  });

  it("renders the item's title", async () => {
    await renderItem(createItem());

    expect(screen.getByText("Road Trip")).toBeTruthy();
  });

  it("renders the subtitle together with the entity type label", async () => {
    await renderItem(createItem({ subtitle: "12 tracks" }));

    expect(screen.getByText(/12 tracks/)).toBeTruthy();
  });

  it("navigates to the item's route on click", async () => {
    const pushSpy = vi.spyOn(router, "push");
    await renderItem(createItem());

    await fireEvent.click(screen.getByRole("button"));

    expect(pushSpy).toHaveBeenCalledWith("/playlist/p1");
  });

  it("emits openFolder instead of navigating for folder rows", async () => {
    const pushSpy = vi.spyOn(router, "push");
    const { emitted } = await renderItem(createItem({
      id: "f1",
      type: "folder",
      title: "Chill",
      to: "/",
      folderItemCount: 3,
    }));

    await fireEvent.click(screen.getByRole("button"));

    expect(emitted().openFolder).toEqual([["f1"]]);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("shows the folder's item count badge", async () => {
    await renderItem(createItem({
      id: "f1",
      type: "folder",
      title: "Chill",
      to: "/",
      folderItemCount: 7,
    }));

    expect(screen.getByText("7")).toBeTruthy();
  });

  it("keeps folder text in the default foreground on the home route", async () => {
    // Folder rows point `to` at home, so on "/" they are exact-active — but
    // they never get the primary background, so the active text color would
    // render primary-foreground (white) on the plain sidebar.
    const { container } = await renderItem(createItem({
      id: "f1",
      type: "folder",
      title: "Chill",
      to: "/",
      folderItemCount: 3,
    }));

    const title = container.querySelector("[data-slot=item-title]");
    expect(title?.className).not.toContain("text-primary-foreground");
  });

  it("uses active text on the row whose route is exact-active", async () => {
    await router.push("/playlist/p1");
    const { container } = await renderItem(createItem());

    const title = container.querySelector("[data-slot=item-title]");
    expect(title?.className).toContain("text-primary-foreground");
  });

  it("renders no text content in compact mode", async () => {
    await renderItem(createItem(), true);

    expect(screen.queryByText("Road Trip")).toBeNull();
    expect(screen.queryByText(/12 tracks/)).toBeNull();
  });
});
