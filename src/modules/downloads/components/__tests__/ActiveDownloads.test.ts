import { render, screen } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "@/app/i18n";
import type { TrackId } from "@/types/ids";
import { useDownloadsStore } from "../../store/downloads.store";
import ActiveDownloads from "../ActiveDownloads.vue";

function renderComponent() {
  return render(ActiveDownloads, { global: { plugins: [i18n] } });
}

function runtime(jobId: string, batchId?: string) {
  return {
    jobId,
    trackId: `nd:${jobId}` as TrackId,
    batchId,
    status: "running" as const,
    downloaded: 0,
    total: null,
    cancelling: false,
  };
}

describe("ActiveDownloads", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    i18n.global.locale.value = "en";
  });

  it("renders nothing while there is no download activity", () => {
    const { container } = renderComponent();
    expect(container.textContent).toBe("");
  });

  it("shows batch progress with a failed count", async () => {
    const store = useDownloadsStore();
    store.registerBatch("b1");
    store.growBatch("b1");
    store.growBatch("b1");
    store.growBatch("b1");
    store.bumpBatch("b1", "finished");
    store.bumpBatch("b1", "failed");
    renderComponent();

    expect(await screen.findByText("2 of 3")).toBeTruthy();
    expect(screen.getByText("1 failed")).toBeTruthy();
  });

  it("hides fully finished batches but keeps counting standalone jobs", async () => {
    const store = useDownloadsStore();
    store.registerBatch("b1");
    store.growBatch("b1");
    store.bumpBatch("b1", "finished");
    store.upsert(runtime("j1"));
    store.upsert(runtime("j2"));
    renderComponent();

    expect(screen.queryByText("1 of 1")).toBeNull();
    expect(await screen.findByText("2")).toBeTruthy();
  });
});
