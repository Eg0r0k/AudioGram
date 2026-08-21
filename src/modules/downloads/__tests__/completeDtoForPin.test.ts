import { beforeEach, describe, expect, it, vi } from "vitest";
import { errAsync, okAsync } from "neverthrow";
import type { SourceTrackDTO } from "@/modules/sources/types";
import { ytTrackId } from "@/types/track-ref";

const providerMock = vi.hoisted(() => ({
  isAvailable: true,
  getTrack: vi.fn(),
}));

vi.mock("@/modules/sources", () => ({
  sources: { forTrack: () => providerMock },
}));
vi.mock("@/modules/tracks/lib/ensurePinned", () => ({ ensurePinned: vi.fn() }));
vi.mock("@/modules/tracks/lib/libraryMembership", () => ({ promoteTrackToLibrary: vi.fn() }));
vi.mock("@/queries/library.queries", () => ({ invalidateLibraryData: vi.fn() }));
vi.mock("@/queries/client", () => ({ queryClient: {} }));
vi.mock("@/queries/shared", () => ({ unwrapResult: vi.fn() }));
vi.mock("@/db/repositories", () => ({ playlistRepository: {}, trackRepository: {} }));
vi.mock("../manager", () => ({ enqueueTrackDownload: vi.fn() }));
vi.mock("../store/downloads.store", () => ({ useDownloadsStore: vi.fn() }));

import { completeDtoForPin } from "../enqueue";

const strippedDto = (): SourceTrackDTO => ({
  id: ytTrackId("v1"),
  title: "Трек",
  artistName: "СЛАВА КПСС",
});

const fullSnapshot = (): SourceTrackDTO => ({
  id: ytTrackId("v1"),
  title: "Трек (details)",
  artistName: "СЛАВА КПСС (details)",
  albumId: "yt:alb1" as SourceTrackDTO["albumId"],
  albumTitle: "Альбом",
  duration: 213,
  coverRef: "https://covers/img.jpg",
});

describe("completeDtoForPin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerMock.isAvailable = true;
  });

  it("fills missing duration and cover from the source snapshot, keeping the row's own values", async () => {
    providerMock.getTrack.mockReturnValue(okAsync(fullSnapshot()));

    const result = await completeDtoForPin(strippedDto());

    expect(providerMock.getTrack).toHaveBeenCalledWith(ytTrackId("v1"));
    expect(result.duration).toBe(213);
    expect(result.coverRef).toBe("https://covers/img.jpg");
    expect(result.albumTitle).toBe("Альбом");
    // The row's own values are not overwritten by the snapshot.
    expect(result.title).toBe("Трек");
    expect(result.artistName).toBe("СЛАВА КПСС");
  });

  it("skips the lookup entirely for complete DTOs", async () => {
    const dto = {
      ...strippedDto(),
      duration: 180,
      coverRef: "https://covers/x.jpg",
      albumId: "yt:alb1" as SourceTrackDTO["albumId"],
    };

    const result = await completeDtoForPin(dto);

    expect(providerMock.getTrack).not.toHaveBeenCalled();
    expect(result).toBe(dto);
  });

  it("still requires the lookup while any of the three fields is missing", async () => {
    providerMock.getTrack.mockReturnValue(okAsync(fullSnapshot()));

    await completeDtoForPin({ ...strippedDto(), duration: 180 });
    await completeDtoForPin({ ...strippedDto(), coverRef: "https://covers/x.jpg" });
    // The cover blob is stored on the album row — coverRef without albumId
    // still pins a coverless track, so the lookup must run.
    await completeDtoForPin({ ...strippedDto(), duration: 180, coverRef: "https://covers/x.jpg" });

    expect(providerMock.getTrack).toHaveBeenCalledTimes(3);
  });

  it("fills the missing albumId so the cover has an album row to live on", async () => {
    providerMock.getTrack.mockReturnValue(okAsync(fullSnapshot()));

    const result = await completeDtoForPin({
      ...strippedDto(),
      duration: 180,
      coverRef: "https://covers/x.jpg",
    });

    expect(result.albumId).toBe("yt:alb1");
    expect(result.coverRef).toBe("https://covers/x.jpg");
    expect(result.duration).toBe(180);
  });

  it("keeps the DTO as it came when the source is unavailable or the lookup fails", async () => {
    providerMock.isAvailable = false;
    const dto = strippedDto();
    expect(await completeDtoForPin(dto)).toBe(dto);

    providerMock.isAvailable = true;
    providerMock.getTrack.mockReturnValue(errAsync({ kind: "NETWORK", message: "down" }));
    expect(await completeDtoForPin(dto)).toBe(dto);
  });
});
