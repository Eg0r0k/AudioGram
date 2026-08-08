import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";

const { tableList, resetSearchIndex, listFiles } = vi.hoisted(() => {
  // Mirrors the acknowledged tables in storage-info.service. clearAllData wipes
  // whatever db.tables reports at runtime, so this list is what the service is
  // *aware* of — an extra table here that the service doesn't acknowledge is
  // exactly the "you forgot a table" case the guard must catch.
  const tableNames = [
    "tracks",
    "albums",
    "artists",
    "tags",
    "playlists",
    "folders",
    "listenEvents",
    "covers",
    "radioStations",
    "audioFeatures",
    "trackChapters",
  ];
  const tableList = tableNames.map(name => ({
    name,
    clear: vi.fn(async () => undefined),
  }));
  return { tableList, resetSearchIndex: vi.fn(), listFiles: vi.fn() };
});

// db exposes both keyed access (db.tracks) and the Dexie `tables` array.
vi.mock("@/db", () => ({
  db: {
    ...Object.fromEntries(tableList.map(t => [t.name, t])),
    tables: tableList,
  },
}));
vi.mock("@/db/storage", () => ({
  storageService: { listFiles, deleteFile: vi.fn() },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock("@/modules/search/searchIndex", () => ({ resetSearchIndex }));

import { clearAllData } from "../storage-info.service";

describe("clearAllData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFiles.mockResolvedValue(ok([]));
  });

  it("clears every table and resets the in-session search index", async () => {
    await clearAllData();

    for (const table of tableList) {
      expect(table.clear).toHaveBeenCalledTimes(1);
    }

    // Without this, the worker-memory index keeps serving deleted entities
    // ("ghosts") until the app reloads.
    expect(resetSearchIndex).toHaveBeenCalledTimes(1);
  });

  it("wipes an unacknowledged table automatically and warns about it", async () => {
    const ghost = { name: "ghostFeature", clear: vi.fn(async () => undefined) };
    tableList.push(ghost);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await clearAllData();

      // Bulletproof: a brand-new table is cleared without being hardcoded.
      expect(ghost.clear).toHaveBeenCalledTimes(1);
      // ...and the developer is nudged so partial clearers get reviewed.
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("ghostFeature"));
    }
    finally {
      warn.mockRestore();
      tableList.pop();
    }
  });
});
