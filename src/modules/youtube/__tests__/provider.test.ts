import { errAsync, okAsync } from "neverthrow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { YoutubeError } from "../types";

const apiMock = vi.hoisted(() => ({ downloadYoutube: vi.fn() }));

vi.mock("@/lib/environment/userAgent", () => ({ IS_TAURI: true, IS_MOBILE: false }));
vi.mock("@/modules/youtube/api/youtubeApi", () => ({
  cancelYoutubeDownload: vi.fn(),
  continueYoutubeMusic: vi.fn(),
  continueYoutubeVideos: vi.fn(),
  downloadYoutube: apiMock.downloadYoutube,
  getYoutubeAlbum: vi.fn(),
  getYoutubeArtist: vi.fn(),
  getYoutubePlaylist: vi.fn(),
  prefetchYoutube: vi.fn(),
  resolveYoutube: vi.fn(),
  searchYoutube: vi.fn(),
  searchYoutubeMusic: vi.fn(),
  searchYoutubeVideosPage: vi.fn(),
}));

import { youtubeProvider } from "../provider";

const networkError: YoutubeError = { kind: "NETWORK", message: "socket hang up" };
const cancelledError: YoutubeError = { kind: "CANCELLED", message: "cancelled" };

describe("youtubeProvider.download retries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiMock.downloadYoutube.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries transient failures and succeeds within three attempts", async () => {
    apiMock.downloadYoutube
      .mockReturnValueOnce(errAsync(networkError))
      .mockReturnValueOnce(errAsync(networkError))
      .mockReturnValueOnce(okAsync({ path: "C:/cache/v1.m4a" }));

    const pending = youtubeProvider.download("v1");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.isOk()).toBe(true);
    expect(apiMock.downloadYoutube).toHaveBeenCalledTimes(3);
  });

  it("gives up after three attempts", async () => {
    apiMock.downloadYoutube.mockReturnValue(errAsync(networkError));

    const pending = youtubeProvider.download("v1");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.isErr()).toBe(true);
    expect(apiMock.downloadYoutube).toHaveBeenCalledTimes(3);
  });

  it("never retries a cancellation", async () => {
    apiMock.downloadYoutube.mockReturnValue(errAsync(cancelledError));

    const pending = youtubeProvider.download("v1");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.isErr()).toBe(true);
    expect(apiMock.downloadYoutube).toHaveBeenCalledTimes(1);
  });
});
