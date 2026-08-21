import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { render, screen, fireEvent } from "@testing-library/vue";
import { createI18n } from "vue-i18n";
import { messages } from "@/app/i18n/messages";
import ResetSettingsDialog from "@/pages/settings/components/ResetSettingsDialog.vue";
import { DialogSummonHost, dismissAllSummonedDialogs, summonDialog } from "@/components/dialogs/summon";

const renderHost = () => render(DialogSummonHost, {
  global: {
    plugins: [createI18n({ legacy: false, locale: "en", messages })],
    // The suite-wide teleport stub swallows the reka dialog portal; this
    // test needs the real content in document.body.
    stubs: { teleport: false },
  },
});

function resetButton() {
  return screen.getByRole("button", { name: /^reset( \(\d\))?$/i }) as HTMLButtonElement;
}

describe("ResetSettingsDialog (summoned)", () => {
  beforeEach(() => {
    // Only the countdown interval is faked — real setTimeout still flushes
    // the reka portal and the summon teardown delay.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });

  afterEach(async () => {
    dismissAllSummonedDialogs();
    await new Promise(resolve => setTimeout(resolve, 350));
    vi.useRealTimers();
  });

  it("disables the reset button while the countdown runs", async () => {
    renderHost();
    summonDialog<boolean>(ResetSettingsDialog);
    await nextTick();
    await screen.findByRole("button", { name: /reset/i });

    expect(resetButton().disabled).toBe(true);
    expect(resetButton().textContent).toContain("(3)");
  });

  it("enables the reset button and resolves true after the countdown", async () => {
    renderHost();
    const promise = summonDialog<boolean>(ResetSettingsDialog);
    await nextTick();
    await screen.findByRole("button", { name: /reset/i });

    vi.advanceTimersByTime(3000);
    await nextTick();

    expect(resetButton().disabled).toBe(false);
    await fireEvent.click(resetButton());
    await expect(promise).resolves.toBe(true);
  });

  it("resolves undefined when cancelled during the countdown", async () => {
    renderHost();
    const promise = summonDialog<boolean>(ResetSettingsDialog);
    await nextTick();
    await screen.findByRole("button", { name: "Cancel" });

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await expect(promise).resolves.toBeUndefined();
  });
});
