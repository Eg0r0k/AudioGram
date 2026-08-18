import { render } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import type { SearchResultItem } from "@/modules/search/types";
import SearchResults from "../components/SearchResults.vue";

// Регрессия: строки артистов/альбомов/плейлистов вызывают openMenu по правому
// клику, но меню рендерится только если LibraryContextMenu ОБОРАЧИВАЕТ строки
// (reka-триггер живёт на содержимом слота).

vi.mock("@/modules/library/composables/useLibrary", () => ({
  useLibrary: () => ({ deleteItem: vi.fn() }),
}));

const entity = (type: SearchResultItem["type"], id: string): SearchResultItem => ({
  id,
  type,
  title: id,
  entityId: id,
  score: 1,
});

const stubs = {
  SearchDropdownRow: { template: "<div data-library-item />" },
  TrackRowsList: true,
  LibraryContextMenu: { template: "<div data-testid='lib-menu'><slot /></div>" },
};

describe("SearchResults", () => {
  it("renders entity rows INSIDE the library context-menu trigger slot", () => {
    const { container } = render(SearchResults, {
      props: {
        activeFilter: "all",
        topResults: [],
        trackResults: [],
        artistResults: [entity("artist", "ar1")],
        albumResults: [entity("album", "al1")],
        playlistResults: [entity("playlist", "pl1")],
        filteredResults: [],
        trackRows: [],
      },
      global: { plugins: [i18n], stubs },
    });

    const menu = container.querySelector("[data-testid='lib-menu']");
    expect(menu).not.toBeNull();
    expect(menu!.querySelectorAll("[data-library-item]")).toHaveLength(3);
  });
});
