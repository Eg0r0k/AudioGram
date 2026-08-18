import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import { TrackId } from "@/types/ids";

const findByIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/db/repositories/trackChapters.repository", () => ({
  trackChaptersRepository: { findById: findByIdMock },
}));

import { trackChaptersQueries } from "../trackChapters.queries";
import { trackChaptersRepository } from "@/db/repositories/trackChapters.repository";

describe("trackChaptersQueries.detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("short-circuits the empty ephemeral-track id without touching the db", async () => {
    const options = trackChaptersQueries.detail(TrackId(""));

    const result = await (options.queryFn as () => Promise<unknown>)();

    // The empty id is shared by every ephemeral (YT/radio) track — a stray
    // row under it would render phantom chapter marks on all of them.
    expect(result).toEqual([]);
    expect(trackChaptersRepository.findById).not.toHaveBeenCalled();
  });

  it("returns the stored chapters for a real track id", async () => {
    findByIdMock.mockResolvedValue(ok({
      trackId: TrackId("t1"),
      chapters: [{ time: 1770, title: "Drop" }],
      updatedAt: 1,
    }));

    const options = trackChaptersQueries.detail(TrackId("t1"));
    const result = await (options.queryFn as () => Promise<unknown>)();

    expect(result).toEqual([{ time: 1770, title: "Drop" }]);
    expect(trackChaptersRepository.findById).toHaveBeenCalledWith("t1");
  });

  it("maps a missing row to an empty chapter list", async () => {
    findByIdMock.mockResolvedValue(ok(undefined));

    const options = trackChaptersQueries.detail(TrackId("t2"));
    const result = await (options.queryFn as () => Promise<unknown>)();

    expect(result).toEqual([]);
  });
});
