import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { render, screen, fireEvent } from "@testing-library/vue";
import { createI18n } from "vue-i18n";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { messages } from "@/app/i18n/messages";
import type { PlaylistId } from "@/types/ids";
import DeleteConfirmDialog from "../DeleteConfirmDialog.vue";
import { DialogSummonHost, dismissAllSummonedDialogs, summonDialog } from "../summon";
import type { DeleteConfirmData } from "../deleteConfirm";

const DATA: DeleteConfirmData = {
  type: "playlist",
  id: "pl-1" as PlaylistId,
  name: "My Playlist",
  trackCount: 3,
};

const renderHost = () => render(DialogSummonHost, {
  global: {
    plugins: [
      createI18n({ legacy: false, locale: "en", messages }),
      VueQueryPlugin,
    ],
    // The suite-wide teleport stub swallows the reka dialog portal; this
    // test needs the real content in document.body.
    stubs: { teleport: false },
  },
});

describe("DeleteConfirmDialog (summoned)", () => {
  afterEach(async () => {
    dismissAllSummonedDialogs();
    await new Promise(resolve => setTimeout(resolve, 350));
  });

  it("resolves true when the destructive action is confirmed", async () => {
    renderHost();
    const promise = summonDialog<boolean>(DeleteConfirmDialog, { data: DATA });
    await nextTick();

    expect(await screen.findByText("My Playlist")).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await expect(promise).resolves.toBe(true);
  });

  it("resolves undefined when cancelled", async () => {
    renderHost();
    const promise = summonDialog<boolean>(DeleteConfirmDialog, { data: DATA });
    await nextTick();
    await screen.findByText("My Playlist");

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await expect(promise).resolves.toBeUndefined();
  });
});
