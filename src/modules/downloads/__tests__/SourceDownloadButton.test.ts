import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/vue";
import { createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { TrackId } from "@/types/ids";
import type { SourceTrackDTO } from "@/modules/sources/types";
import { downloadSubject } from "../enqueue";
import SourceDownloadButton from "../components/SourceDownloadButton.vue";

vi.mock("../enqueue", () => ({
  downloadSubject: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/db/repositories", () => ({
  offlineCopyRepository: { findById: vi.fn().mockResolvedValue({ isErr: () => false, isOk: () => true, value: null }) },
}));

const dto: SourceTrackDTO = {
  id: TrackId("yt:abc123def45"),
  title: "T",
};

function renderButton() {
  const i18n = createI18n({
    legacy: false,
    locale: "en",
    messages: { en: {} },
    missingWarn: false,
    fallbackWarn: false,
  });
  return render(SourceDownloadButton, {
    props: { dto },
    global: {
      plugins: [createPinia(), VueQueryPlugin, i18n],
    },
  });
}

describe("SourceDownloadButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queues a download for the row dto", async () => {
    vi.mocked(downloadSubject).mockResolvedValue("job-1");
    renderButton();

    const button = await screen.findByRole("button");
    button.click();
    await Promise.resolve();

    expect(downloadSubject).toHaveBeenCalledWith({ kind: "remote", dto });
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("tells the user when nothing needs downloading (copy already exists)", async () => {
    // downloadSubject returns null when an offline copy is already present —
    // e.g. the click landed while the hasCopy query was still loading.
    vi.mocked(downloadSubject).mockResolvedValue(null);
    renderButton();

    const button = await screen.findByRole("button");
    button.click();
    await vi.waitFor(() => {
      expect(toast.info).toHaveBeenCalledTimes(1);
    });
  });
});
