import { describe, expect, it } from "vitest";
import { buildPlaybackQueue, clampQueueIndex, getCurrentIndexAfterMove, getItemsByOrder, moveItem, resolveQueueReorder } from "../lib/queue-order";

describe("queue-order helpers", () => {
  it("moves an item without mutating the original list", () => {
    const list = ["a", "b", "c"];

    expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a"]);
    expect(list).toEqual(["a", "b", "c"]);
  });

  it("keeps the list unchanged for invalid move indices", () => {
    const list = ["a", "b"];

    expect(moveItem(list, -1, 0)).toEqual(list);
    expect(moveItem(list, 0, 10)).toEqual(list);
  });

  it("restores items by id order and skips missing ids", () => {
    const items: Array<{ id: string; value: number }> = [
      { id: "item-1", value: 1 },
      { id: "item-2", value: 2 },
    ];

    expect(getItemsByOrder(items, ["item-2", "missing", "item-1"])).toEqual([
      { id: "item-2", value: 2 },
      { id: "item-1", value: 1 },
    ]);
  });

  it("clamps queue indices and returns -1 for empty queues", () => {
    expect(clampQueueIndex(-10, 3)).toBe(0);
    expect(clampQueueIndex(10, 3)).toBe(2);
    expect(clampQueueIndex(1, 3)).toBe(1);
    expect(clampQueueIndex(0, 0)).toBe(-1);
  });

  it("builds a non-shuffled playback queue with a clamped index", () => {
    const result = buildPlaybackQueue(["a", "b"], 10, false);

    expect(result).toEqual({ items: ["a", "b"], playbackIndex: 1 });
  });

  it("keeps the selected item first in a shuffled playback queue", () => {
    const result = buildPlaybackQueue(["a", "b", "c"], 1, true);

    expect(result.playbackIndex).toBe(0);
    expect(result.items[0]).toBe("b");
    expect(new Set(result.items)).toEqual(new Set(["a", "b", "c"]));
  });

  it("updates current index after moves around the current item", () => {
    expect(getCurrentIndexAfterMove(2, 0, 2)).toBe(1);
    expect(getCurrentIndexAfterMove(0, 2, 0)).toBe(1);
    expect(getCurrentIndexAfterMove(1, 1, 3)).toBe(3);
    expect(getCurrentIndexAfterMove(1, 3, 4)).toBe(1);
  });

  it("maps a same-list sort suggestion to absolute queue indexes", () => {
    const move = resolveQueueReorder(
      { sameList: true, sourceIndexes: [0], targetIndex: 2 },
      3,
    );

    expect(move).toEqual({ from: 3, to: 5 });
  });

  it("keeps slice indexes as-is when the current track is at the queue start", () => {
    const move = resolveQueueReorder(
      { sameList: true, sourceIndexes: [4], targetIndex: 1 },
      0,
    );

    expect(move).toEqual({ from: 4, to: 1 });
  });

  it("ignores cross-list and no-op sort suggestions", () => {
    expect(resolveQueueReorder(
      { sameList: false, sourceIndexes: [0], targetIndex: 2 },
      1,
    )).toBeNull();

    expect(resolveQueueReorder(
      { sameList: true, sourceIndexes: [2], targetIndex: 2 },
      1,
    )).toBeNull();

    expect(resolveQueueReorder(
      { sameList: true, sourceIndexes: [], targetIndex: 0 },
      1,
    )).toBeNull();
  });
});
