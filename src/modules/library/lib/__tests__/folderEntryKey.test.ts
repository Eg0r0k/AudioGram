import { describe, expect, it } from "vitest";
import { libraryItemKey, parseFolderEntryKey } from "../folderEntryKey";

describe("folder entry keys", () => {
  it("round-trips a local entity id", () => {
    const key = libraryItemKey({ type: "album", id: "al-1" });
    expect(key).toBe("album:al-1");
    expect(parseFolderEntryKey(key)).toEqual([{ type: "album", id: "al-1" }]);
  });

  it("round-trips remote ids that carry colons themselves", () => {
    expect(parseFolderEntryKey("album:nd:MPREb1")).toEqual([{ type: "album", id: "nd:MPREb1" }]);
    expect(parseFolderEntryKey("artist:yt:UC123")).toEqual([{ type: "artist", id: "yt:UC123" }]);
    expect(parseFolderEntryKey("playlist:nd:pl9")).toEqual([{ type: "playlist", id: "nd:pl9" }]);
  });

  it("rejects unknown types and empty ids", () => {
    expect(parseFolderEntryKey("liked:x")).toEqual([]);
    expect(parseFolderEntryKey("album:")).toEqual([]);
    expect(parseFolderEntryKey("album")).toEqual([]);
  });
});
