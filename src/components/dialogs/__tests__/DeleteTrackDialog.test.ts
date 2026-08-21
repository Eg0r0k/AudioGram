import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { render, screen, fireEvent } from "@testing-library/vue";
import { createI18n } from "vue-i18n";
import { messages } from "@/app/i18n/messages";
import DeleteTrackDialog, { type DeleteTrackConfirmation } from "../DeleteTrackDialog.vue";
import { DialogSummonHost, dismissAllSummonedDialogs, summonDialog } from "../summon";

const renderHost = () => render(DialogSummonHost, {
  global: {
    plugins: [createI18n({ legacy: false, locale: "en", messages })],
    // The suite-wide teleport stub swallows the reka dialog portal; this
    // test needs the real content in document.body.
    stubs: { teleport: false },
  },
});

const summon = () =>
  summonDialog<DeleteTrackConfirmation>(DeleteTrackDialog, { trackTitle: "I Am a God" });

describe("DeleteTrackDialog (summoned)", () => {
  afterEach(async () => {
    dismissAllSummonedDialogs();
    await new Promise(resolve => setTimeout(resolve, 350));
  });

  it("shows the track title and resolves without remembering by default", async () => {
    renderHost();
    const promise = summon();
    await nextTick();

    expect(await screen.findByText(/I Am a God/)).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await expect(promise).resolves.toEqual({ dontAskAgain: false });
  });

  it("resolves with dontAskAgain when the checkbox is ticked", async () => {
    renderHost();
    const promise = summon();
    await nextTick();
    await screen.findByRole("checkbox");

    await fireEvent.click(screen.getByRole("checkbox"));
    await fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await expect(promise).resolves.toEqual({ dontAskAgain: true });
  });

  it("resolves undefined when cancelled", async () => {
    renderHost();
    const promise = summon();
    await nextTick();
    await screen.findByRole("button", { name: "Cancel" });

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await expect(promise).resolves.toBeUndefined();
  });
});
