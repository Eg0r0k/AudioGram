import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { renderWithPlugins, screen } from "@/test/utils";
import ClearAllDataDialog from "@/pages/settings/components/ClearAllDataDialog.vue";

const stats = { tracksCount: 10, albumsCount: 2, artistsCount: 3, totalUsed: "1.2 GB" };

// Reka-ui mounts portal content one macrotask after render. Only
// setInterval/clearInterval are faked, so a real setTimeout flushes it.
function flushPortal() {
  return new Promise(resolve => setTimeout(resolve, 20));
}

function deleteButton() {
  return screen.getByRole("button", { name: /delete everything/i }) as HTMLButtonElement;
}

describe("ClearAllDataDialog", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disables the delete button while the countdown runs", async () => {
    renderWithPlugins(ClearAllDataDialog, {
      props: { open: true, stats },
      stubs: { teleport: false },
    });
    await flushPortal();

    expect(deleteButton().disabled).toBe(true);
    expect(deleteButton().textContent).toContain("(3)");
  });

  it("enables the delete button after 3 seconds", async () => {
    renderWithPlugins(ClearAllDataDialog, {
      props: { open: true, stats },
      stubs: { teleport: false },
    });
    await flushPortal();

    vi.advanceTimersByTime(3000);
    await nextTick();

    expect(deleteButton().disabled).toBe(false);
    expect(deleteButton().textContent).not.toContain("(");
  });

  it("emits confirm on click after the countdown", async () => {
    const { emitted } = renderWithPlugins(ClearAllDataDialog, {
      props: { open: true, stats },
      stubs: { teleport: false },
    });
    await flushPortal();

    vi.advanceTimersByTime(3000);
    await nextTick();
    deleteButton().click();
    await nextTick();

    expect(emitted("confirm")).toBeTruthy();
  });

  it("restarts the countdown when reopened", async () => {
    const { rerender } = renderWithPlugins(ClearAllDataDialog, {
      props: { open: true, stats },
      stubs: { teleport: false },
    });
    await flushPortal();

    vi.advanceTimersByTime(3000);
    await nextTick();
    await rerender({ open: false, stats });
    await rerender({ open: true, stats });
    await flushPortal();

    expect(deleteButton().disabled).toBe(true);
    expect(deleteButton().textContent).toContain("(3)");
  });

  it("shows the summary of what will be deleted", async () => {
    renderWithPlugins(ClearAllDataDialog, {
      props: { open: true, stats },
      stubs: { teleport: false },
    });
    await flushPortal();

    expect(screen.getByText(/10 tracks/)).toBeTruthy();
    expect(screen.getByText(/1\.2 GB/)).toBeTruthy();
  });
});
