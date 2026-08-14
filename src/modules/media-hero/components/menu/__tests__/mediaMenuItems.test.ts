import { describe, expect, it } from "vitest";
import { computed } from "vue";
import { render, screen } from "@testing-library/vue";
import { createI18n } from "vue-i18n";
import { h } from "vue";
import { provideMenuComponents, type MenuComponents } from "../../../composables/useMenuComponents";
import type { MediaActions } from "../types";
import AlbumContext from "../contexts/AlbumContext.vue";
import ArtistContext from "../contexts/ArtistContext.vue";

//
// "Изменить"/"Удалить" write to a Dexie row. Live catalog entities (an ND
// album page, an ND artist page) have none, so the items used to sit in the
// menu doing nothing — they must not be rendered at all.
//

function actions(canManage: boolean): MediaActions {
  return {
    addToQueue: () => {},
    edit: () => {},
    delete: () => {},
    share: () => {},
    canManage: computed(() => canManage),
    canDownloadOffline: computed(() => true),
    downloadOffline: () => {},
  };
}

// The reka items need a live MenuRoot; the kit injection is the seam that
// lets a test render the same contexts without one.
const stubComponents: MenuComponents = {
  Item: { setup: (_, { slots }) => () => h("button", { type: "button" }, slots.default?.()) },
  Separator: { setup: () => () => h("hr") },
};

function renderContext(component: unknown, canManage: boolean) {
  const i18n = createI18n({
    legacy: false,
    locale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: {
      en: {
        common: { edit: "Edit", delete: "Delete" },
        media: { contextMenu: { downloadAlbum: "Download album" } },
      },
    },
  });

  return render({
    components: { Ctx: component as never },
    props: { actions: { type: Object, required: true } },
    setup() {
      provideMenuComponents(stubComponents);
    },
    template: "<Ctx :actions=\"actions\" />",
  }, {
    props: { actions: actions(canManage) },
    global: { plugins: [i18n] },
  });
}

describe("media-hero menus for catalog entities", () => {
  it("hides album edit/delete when the album is not a library row", () => {
    renderContext(AlbumContext, false);

    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
    expect(screen.getByText("Download album")).toBeTruthy();
  });

  it("keeps album edit/delete for a library row", () => {
    renderContext(AlbumContext, true);

    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("hides artist edit/delete when the artist is not a library row", () => {
    renderContext(ArtistContext, false);

    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
  });
});
