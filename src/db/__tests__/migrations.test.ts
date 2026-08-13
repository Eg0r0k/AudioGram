import { describe, expect, it, vi } from "vitest";
import { markPinned, upgradeToV10, type UpgradeTransaction } from "../migrations";

describe("markPinned", () => {
  it("stamps pinned = 1 and keeps other fields intact", () => {
    const row = { id: "t1", title: "Song", pinned: undefined as 0 | 1 | undefined };

    markPinned(row);

    expect(row).toEqual({ id: "t1", title: "Song", pinned: 1 });
  });

  it("overwrites an existing pinned value (upgrade rows are all pre-multi-source)", () => {
    const row = { pinned: 0 as 0 | 1 };

    markPinned(row);

    expect(row.pinned).toBe(1);
  });
});

describe("upgradeToV10", () => {
  it("marks every row of tracks, albums and artists as pinned", async () => {
    const modify = vi.fn().mockResolvedValue(0);
    const toCollection = vi.fn(() => ({ modify }));
    const table = vi.fn(() => ({ toCollection }));

    await upgradeToV10({ table } as unknown as UpgradeTransaction);

    expect(table.mock.calls.map(([name]) => name)).toEqual(["tracks", "albums", "artists"]);
    expect(modify).toHaveBeenCalledTimes(3);
    expect(modify).toHaveBeenCalledWith(markPinned);
  });
});
