import { describe, expect, it } from "vitest";
import type { SidebarFolderEntity } from "@/db/entities";
import type { LibraryItem } from "@/modules/library/types";
import {
  buildFolderPickerItems,
  countFolderPickerItemsByType,
  filterFolderPickerItems,
  normalizePickerQuery,
} from "../folderPicker";

const item = (id: string, type: LibraryItem["type"], title: string, subtitle?: string): LibraryItem => ({
  id, type, title, subtitle, isPinned: false, addedAt: 1, to: "/", rounded: type === "artist",
});

const folder = (id: string, name: string, items: SidebarFolderEntity["items"]): SidebarFolderEntity =>
  ({ id, name, items, addedAt: 1, updatedAt: 1 }) as SidebarFolderEntity;

const library: LibraryItem[] = [
  item("a1", "artist", "Zebra"),
  item("al1", "album", "Nevermind", "Nirvana"),
  item("al2", "album", "In Utero", "Nirvana"),
  item("p1", "playlist", "Chill"),
  item("liked", "liked", "Liked"),
  item("f1", "folder", "Rock"),
];

const folders = [
  folder("f1", "Rock", [{ type: "album", id: "al1" }]),
  folder("f2", "Grunge", [{ type: "album", id: "al2" }, { type: "playlist", id: "p1" }]),
];

describe("buildFolderPickerItems", () => {
  it("drops items already in the target folder and non-folderable types", () => {
    const result = buildFolderPickerItems(library, folders, "f1");
    expect(result.map(i => i.id)).toEqual(["p1", "al2", "a1"]);
  });

  it("annotates items living in another folder with that folder's name", () => {
    const result = buildFolderPickerItems(library, folders, "f1");
    expect(result.find(i => i.id === "al2")?.folderName).toBe("Grunge");
    expect(result.find(i => i.id === "p1")?.folderName).toBe("Grunge");
    expect(result.find(i => i.id === "a1")?.folderName).toBeUndefined();
  });

  it("sorts by title with localeCompare", () => {
    const result = buildFolderPickerItems(library, folders, "f2");
    expect(result.map(i => i.title)).toEqual(["Nevermind", "Zebra"]);
  });
});

describe("filterFolderPickerItems", () => {
  const items = buildFolderPickerItems(library, folders, "f1");

  it("returns everything for filter=all and empty query", () => {
    expect(filterFolderPickerItems(items, "all", "")).toHaveLength(3);
  });

  it("filters by type", () => {
    expect(filterFolderPickerItems(items, "album", "").map(i => i.id)).toEqual(["al2"]);
  });

  it("matches title and subtitle case-insensitively with collapsed whitespace", () => {
    expect(filterFolderPickerItems(items, "all", "  NIRVANA ").map(i => i.id)).toEqual(["al2"]);
    expect(filterFolderPickerItems(items, "all", "zeb").map(i => i.id)).toEqual(["a1"]);
    expect(filterFolderPickerItems(items, "playlist", "zeb")).toEqual([]);
  });
});

describe("countFolderPickerItemsByType", () => {
  it("counts each folderable type", () => {
    const items = buildFolderPickerItems(library, folders, "f1");
    expect(countFolderPickerItemsByType(items)).toEqual({ artist: 1, album: 1, playlist: 1 });
  });
});

describe("normalizePickerQuery", () => {
  it("trims, lowercases and collapses whitespace", () => {
    expect(normalizePickerQuery("  Foo   Bar ")).toBe("foo bar");
  });
});
