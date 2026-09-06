import { fireEvent, render, screen } from "@testing-library/vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "@/app/i18n";
import { ROUTE_NAMES } from "@/app/router/route-names";
import { useSearch } from "@/modules/search/composables/useSearch";
import MobileBottomNav from "../MobileBottomNav.vue";

const Page = { template: "<div />" };

let router: Router;

const renderNav = async () => {
  render(MobileBottomNav, {
    global: {
      plugins: [i18n, router],
      directives: { ripple: {} },
    },
  });
  await router.isReady();
};

const label = (key: string) => i18n.global.t(`nav.${key}`);
const tab = (key: string) => screen.getByText(label(key)).closest("a, button")!;
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

describe("MobileBottomNav and the search field", () => {
  const search = useSearch();

  beforeEach(async () => {
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", name: ROUTE_NAMES.HOME, component: Page },
        { path: "/all", name: ROUTE_NAMES.ALL_MUSIC, component: Page },
        { path: "/liked", name: ROUTE_NAMES.LIKED, component: Page },
      ],
    });
    await router.push("/");
    search.openSearch();
    search.query.value = "daft";
  });

  it("clears the typed query when another tab is opened", async () => {
    await renderNav();

    await fireEvent.click(tab("library"));
    await settle();

    expect(router.currentRoute.value.name).toBe(ROUTE_NAMES.ALL_MUSIC);
    expect(search.query.value).toBe("");
    expect(search.isSearchOpen.value).toBe(false);
  });

  it("clears the typed query when going home from the search panel", async () => {
    await renderNav();

    await fireEvent.click(tab("home"));
    await settle();

    expect(search.query.value).toBe("");
    expect(search.isSearchOpen.value).toBe(false);
  });

  it("keeps the query when the search tab itself is tapped", async () => {
    await renderNav();

    await fireEvent.click(tab("search"));
    await settle();

    expect(search.query.value).toBe("daft");
    expect(search.isSearchOpen.value).toBe(true);
  });
});
