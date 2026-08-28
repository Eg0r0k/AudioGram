import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { render, screen, fireEvent } from "@testing-library/vue";
import { createI18n } from "vue-i18n";
import { messages } from "@/app/i18n/messages";
import type { SidebarFolderEntity } from "@/db/entities";
import type { LibraryItem } from "@/modules/library/types";
import MoveToFolderDialog from "../MoveToFolderDialog.vue";
import { DialogSummonHost, dismissAllSummonedDialogs, summonDialog } from "../summon";

const item: LibraryItem = {
  id: "al1", type: "album", title: "Nevermind", isPinned: false, addedAt: 1, to: "/", rounded: false,
};

const folder = (id: string, name: string): SidebarFolderEntity =>
  ({ id, name, items: [], addedAt: 1, updatedAt: 1 }) as unknown as SidebarFolderEntity;

const renderHost = () => render(DialogSummonHost, {
  global: {
    plugins: [createI18n({ legacy: false, locale: "en", messages })],
    stubs: { teleport: false },
  },
});

describe("MoveToFolderDialog (summoned)", () => {
  afterEach(async () => {
    dismissAllSummonedDialogs();
    await new Promise(resolve => setTimeout(resolve, 350));
  });

  it("resolves with the id of the picked folder", async () => {
    renderHost();
    const promise = summonDialog<string>(MoveToFolderDialog, {
      item,
      folders: [folder("f1", "Rock"), folder("f2", "Grunge")],
    });
    await nextTick();

    expect(await screen.findByText("Nevermind")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Grunge" }));
    await expect(promise).resolves.toBe("f2");
  });

  it("shows the empty hint when there are no folders", async () => {
    renderHost();
    summonDialog<string>(MoveToFolderDialog, { item, folders: [] });
    await nextTick();

    expect(await screen.findByText("Create a folder first")).toBeInTheDocument();
  });
});
