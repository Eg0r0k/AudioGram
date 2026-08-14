import { describe, expect, it } from "vitest";
import { h } from "vue";
import { render, screen } from "@testing-library/vue";
import { createI18n } from "vue-i18n";
import type { TrackMenuCaps } from "@/modules/tracks/composables/useTrackMenuCaps";
import { provideTrackMenuComponents } from "../../useTrackMenuComponents";
import ExportFileItem from "../ExportFileItem.vue";

//
// "Save as…" reads a real file: the track's own local file or its offline
// copy. A live ND/YT catalog row has neither, so the item used to sit in the
// menu and silently do nothing when clicked.
//

function caps(canExportFile: boolean): TrackMenuCaps {
  return {
    source: "nd",
    isInLibrary: false,
    isPinned: false,
    hasOfflineCopy: canExportFile,
    canExportFile,
    canOffline: true,
    canAttachLyrics: false,
    canOpenExternal: true,
  };
}

function renderItem(value: TrackMenuCaps | null) {
  const i18n = createI18n({
    legacy: false,
    locale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: { track: { contextMenu: { exportFile: "Save as…" } } } },
  });

  return render({
    components: { ExportFileItem },
    props: { caps: { type: Object, default: null } },
    setup() {
      provideTrackMenuComponents({
        Item: { setup: (_, { slots }) => () => h("button", { type: "button" }, slots.default?.()) },
        Separator: { setup: () => () => h("hr") },
        Sub: { setup: (_, { slots }) => () => h("div", slots.default?.()) },
        SubTrigger: { setup: (_, { slots }) => () => h("div", slots.default?.()) },
        SubContent: { setup: (_, { slots }) => () => h("div", slots.default?.()) },
      } as never);
    },
    template: "<ExportFileItem :caps=\"caps\" />",
  }, {
    props: { caps: value },
    global: { plugins: [i18n] },
  });
}

describe("ExportFileItem", () => {
  it("is hidden when there is no file to export", () => {
    renderItem(caps(false));

    expect(screen.queryByText("Save as…")).toBeNull();
  });

  it("is shown once a local file or an offline copy exists", () => {
    renderItem(caps(true));

    expect(screen.getByText("Save as…")).toBeTruthy();
  });

  it("stays visible without caps (local-only call sites)", () => {
    renderItem(null);

    expect(screen.getByText("Save as…")).toBeTruthy();
  });
});
