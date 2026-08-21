import { beforeEach, describe, expect, it, vi } from "vitest";
import { errAsync, okAsync } from "neverthrow";
import { ndTrackId, ytAlbumId, ytArtistId, ytTrackId } from "@/types/track-ref";
import type { YtMusicTrack } from "@/modules/youtube/types";

const detailsMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/youtube/api/youtubeApi", () => ({
  getYoutubeMusicDetails: detailsMock,
}));
vi.mock("@/modules/youtube/provider", () => ({
  youtubeProvider: { isAvailable: true },
}));

import { ytSourceProvider } from "../yt.provider";

const details = (): YtMusicTrack => ({
  id: "v1",
  title: "Трек",
  artists: [{ id: "a1", name: "СЛАВА КПСС" }],
  album: { id: "alb1", name: "Альбом" },
  duration: 213,
  thumbnail: "https://covers/img.jpg",
  isVideo: false,
  trackNr: null,
}) as unknown as YtMusicTrack;

describe("ytSourceProvider.getTrack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps the details snapshot into a full DTO with album and artist ids", async () => {
    detailsMock.mockReturnValue(okAsync(details()));

    const result = await ytSourceProvider.getTrack(ytTrackId("v1"));

    expect(detailsMock).toHaveBeenCalledWith("v1");
    expect(result.isOk()).toBe(true);
    const dto = result._unsafeUnwrap();
    expect(dto).toMatchObject({
      id: ytTrackId("v1"),
      title: "Трек",
      artistName: "СЛАВА КПСС",
      artistIds: [ytArtistId("a1")],
      albumId: ytAlbumId("alb1"),
      albumTitle: "Альбом",
      duration: 213,
      coverRef: "https://covers/img.jpg",
    });
  });

  it("rejects non-yt ids without calling the api", async () => {
    const result = await ytSourceProvider.getTrack(ndTrackId("s1"));

    expect(detailsMock).not.toHaveBeenCalled();
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().kind).toBe("PARSE");
  });

  it("maps api failures through the source error mapping", async () => {
    detailsMock.mockReturnValue(errAsync({ kind: "NETWORK", message: "offline" }));

    const result = await ytSourceProvider.getTrack(ytTrackId("v1"));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().kind).toBe("NETWORK");
  });
});
