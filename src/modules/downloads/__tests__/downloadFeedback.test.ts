import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "vue-sonner";
import { TrackId } from "@/types/ids";
import type { SourceTrackDTO } from "@/modules/sources/types";
import { downloadSubject } from "../enqueue";
import { downloadDtoWithFeedback } from "../downloadFeedback";

vi.mock("../enqueue", () => ({
  downloadSubject: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/app/i18n", () => ({
  i18n: { global: { t: (key: string) => key } },
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const dto: SourceTrackDTO = { id: TrackId("yt:abc123def45"), title: "T" };

describe("downloadDtoWithFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stays quiet when a job is queued", async () => {
    vi.mocked(downloadSubject).mockResolvedValue("job-1");
    await downloadDtoWithFeedback(dto);
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("acknowledges an already-downloaded track", async () => {
    vi.mocked(downloadSubject).mockResolvedValue(null);
    await downloadDtoWithFeedback(dto);
    expect(toast.info).toHaveBeenCalledWith("downloads.done");
  });

  it("reports a failure instead of throwing", async () => {
    vi.mocked(downloadSubject).mockRejectedValue(new Error("boom"));
    await expect(downloadDtoWithFeedback(dto)).resolves.toBeUndefined();
    expect(toast.error).toHaveBeenCalledWith("track.downloadFailed");
  });
});
