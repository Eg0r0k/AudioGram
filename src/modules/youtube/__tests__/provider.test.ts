import { errAsync, okAsync } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

//
// Retries live in the download manager (downloads/manager.ts, MAX_ATTEMPTS
// with backoff) — the provider must run yt_download exactly once per call,
// otherwise the layers multiply (3 manager attempts × N provider attempts).
//
describe("youtubeProvider.download", () => {
  beforeEach(() => {
    apiMock.downloadYoutube.mockReset();
  });

  it("passes a success through untouched", async () => {
    apiMock.downloadYoutube.mockReturnValue(okAsync({ path: "C:/cache/v1.m4a" }));

    const result = await youtubeProvider.download("v1");

    expect(result._unsafeUnwrap()).toEqual({ path: "C:/cache/v1.m4a" });
    expect(apiMock.downloadYoutube).toHaveBeenCalledTimes(1);
  });

  it("runs yt_download exactly once even on a transient failure", async () => {
    apiMock.downloadYoutube.mockReturnValue(errAsync(networkError));

    const result = await youtubeProvider.download("v1");

    expect(result._unsafeUnwrapErr()).toEqual(networkError);
    expect(apiMock.downloadYoutube).toHaveBeenCalledTimes(1);
  });
});
