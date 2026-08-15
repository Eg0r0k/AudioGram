import { describe, expect, it } from "vitest";
import type { SearchDocument } from "../types";
import { countTrackDocuments, trackProjectionMismatch } from "../projectionCheck";

function doc(type: SearchDocument["type"], id: string): SearchDocument {
  return { id: `${type}:${id}`, type, title: id, entityId: id };
}

describe("trackProjectionMismatch", () => {
  it("stays silent when the index matches the database", () => {
    expect(trackProjectionMismatch(3, 3)).toBeNull();
    expect(trackProjectionMismatch(0, 0)).toBeNull();
  });

  it("reports both counts and the rebuild hint on drift", () => {
    const message = trackProjectionMismatch(5, 3);
    expect(message).toContain("5");
    expect(message).toContain("3");
    expect(message).toMatch(/rebuild/i);
  });

  it("reports drift in either direction", () => {
    expect(trackProjectionMismatch(2, 4)).not.toBeNull();
    expect(trackProjectionMismatch(4, 2)).not.toBeNull();
  });
});

describe("countTrackDocuments", () => {
  it("counts only track documents", () => {
    const documents = [
      doc("track", "t1"),
      doc("track", "t2"),
      doc("album", "al1"),
      doc("artist", "ar1"),
      doc("playlist", "pl1"),
    ];
    expect(countTrackDocuments(documents)).toBe(2);
    expect(countTrackDocuments([])).toBe(0);
  });
});
