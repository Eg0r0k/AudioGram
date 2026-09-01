import { describe, expect, it } from "vitest";
import { dropIndexAt, edgeScrollSpeed, rowShift } from "../lib/queue-drag";

describe("rowShift", () => {
  it("moves the rows between the lift and the drop toward the vacated slot", () => {
    // Dragging row 1 down onto slot 3: rows 2 and 3 move up one.
    expect([0, 1, 2, 3, 4].map(i => rowShift(i, 1, 3))).toEqual([0, 0, -1, -1, 0]);
    // Dragging row 3 up onto slot 1: rows 1 and 2 move down one.
    expect([0, 1, 2, 3, 4].map(i => rowShift(i, 3, 1))).toEqual([0, 1, 1, 0, 0]);
  });

  it("leaves everything in place while the item hovers its own slot", () => {
    expect([0, 1, 2].map(i => rowShift(i, 1, 1))).toEqual([0, 0, 0]);
  });
});

describe("dropIndexAt", () => {
  it("maps a content offset to the slot under it", () => {
    expect(dropIndexAt(0, 64, 10)).toBe(0);
    expect(dropIndexAt(63, 64, 10)).toBe(0);
    expect(dropIndexAt(64, 64, 10)).toBe(1);
    expect(dropIndexAt(200, 64, 10)).toBe(3);
  });

  it("clamps to the list", () => {
    expect(dropIndexAt(-40, 64, 10)).toBe(0);
    expect(dropIndexAt(10_000, 64, 10)).toBe(9);
    expect(dropIndexAt(50, 64, 0)).toBe(0);
  });
});

describe("edgeScrollSpeed", () => {
  it("is zero away from the edges", () => {
    expect(edgeScrollSpeed(300, 100, 500, 56, 14)).toBe(0);
  });

  it("ramps toward the top edge and past it", () => {
    expect(edgeScrollSpeed(150, 100, 500, 56, 14)).toBeLessThan(0);
    expect(edgeScrollSpeed(100, 100, 500, 56, 14)).toBe(-14);
    expect(edgeScrollSpeed(20, 100, 500, 56, 14)).toBe(-14);
  });

  it("ramps toward the bottom edge", () => {
    expect(edgeScrollSpeed(460, 100, 500, 56, 14)).toBeGreaterThan(0);
    expect(edgeScrollSpeed(500, 100, 500, 56, 14)).toBe(14);
  });
});
