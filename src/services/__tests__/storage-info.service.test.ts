import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";

const { tables, resetSearchIndex, listFiles } = vi.hoisted(() => {
  const tableNames = [
    "tracks",
    "albums",
    "artists",
    "tags",
    "playlists",
    "folders",
    "listenEvents",
    "audioFeatures",
    "trackChapters",
  ];
  const tables = Object.fromEntries(
    tableNames.map(name => [name, { clear: vi.fn(async () => undefined) }]),
  );
  return { tables, resetSearchIndex: vi.fn(), listFiles: vi.fn() };
});

vi.mock("@/db", () => ({ db: tables }));
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

    for (const table of Object.values(tables)) {
      expect(table.clear).toHaveBeenCalledTimes(1);
    }

    // Without this, the worker-memory index keeps serving deleted entities
    // ("ghosts") until the app reloads.
    expect(resetSearchIndex).toHaveBeenCalledTimes(1);
  });
});
