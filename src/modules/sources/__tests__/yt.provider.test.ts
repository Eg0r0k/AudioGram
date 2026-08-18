import { beforeEach, describe, expect, it, vi } from "vitest";
import { errAsync, okAsync } from "neverthrow";
import { ytTrackId } from "@/types/track-ref";
import { TrackId } from "@/types/ids";
import { ytSourceProvider } from "../providers/yt.provider";
import { youtubeProvider } from "@/modules/youtube/provider";

vi.mock("@/modules/youtube/provider", () => ({
  youtubeProvider: {
    isAvailable: true,
    download: vi.fn(),
    cancelDownload: vi.fn(),
    resolve: vi.fn(),
    searchMusic: vi.fn(),
    prefetch: vi.fn(),
  },
}));

describe("ytSourceProvider.downloadToFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the downloaded file path for a yt track id", async () => {
    vi.mocked(youtubeProvider.download).mockReturnValue(
      okAsync({ path: "C:/cache/abc.m4a" }),
    );

    const result = await ytSourceProvider.downloadToFile(ytTrackId("dQw4w9WgXcQ"));

    expect(result._unsafeUnwrap()).toEqual({ path: "C:/cache/abc.m4a" });
    expect(youtubeProvider.download).toHaveBeenCalledWith("dQw4w9WgXcQ", undefined);
  });

  it("maps a cancelled download onto the CANCELLED kind the manager expects", async () => {
    vi.mocked(youtubeProvider.download).mockReturnValue(
      errAsync({ kind: "CANCELLED", message: "download cancelled" }),
    );

    const result = await ytSourceProvider.downloadToFile(ytTrackId("dQw4w9WgXcQ"));

    // sources/types.ts contract: a cancelled downloadToFile fails with
    // kind "CANCELLED" — that is what manager.runJob matches on.
    expect(result._unsafeUnwrapErr().kind).toBe("CANCELLED");
  });

  it("rejects foreign ids before hitting the backend", async () => {
    const result = await ytSourceProvider.downloadToFile(TrackId("nd:s1"));
    expect(result._unsafeUnwrapErr().kind).toBe("PARSE");
    expect(youtubeProvider.download).not.toHaveBeenCalled();
  });
});

describe("ytSourceProvider.prefetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warms the backend cache with the raw video id", async () => {
    vi.mocked(youtubeProvider.prefetch).mockReturnValue(okAsync(undefined));

    const result = await ytSourceProvider.prefetch!(ytTrackId("dQw4w9WgXcQ"));

    expect(result.isOk()).toBe(true);
    expect(youtubeProvider.prefetch).toHaveBeenCalledWith("dQw4w9WgXcQ");
  });

  it("maps backend errors onto the generic source error kinds", async () => {
    vi.mocked(youtubeProvider.prefetch).mockReturnValue(
      errAsync({ kind: "NETWORK", message: "googlevideo timed out" }),
    );

    const result = await ytSourceProvider.prefetch!(ytTrackId("dQw4w9WgXcQ"));

    expect(result._unsafeUnwrapErr().kind).toBe("NETWORK");
  });

  it("rejects foreign ids before hitting the backend", async () => {
    const result = await ytSourceProvider.prefetch!(TrackId("nd:s1"));
    expect(result._unsafeUnwrapErr().kind).toBe("PARSE");
    expect(youtubeProvider.prefetch).not.toHaveBeenCalled();
  });
});
