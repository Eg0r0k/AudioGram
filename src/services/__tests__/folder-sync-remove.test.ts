import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
import type { AlbumId, TrackId } from "@/types/ids";
import { FolderSyncService } from "../import/folder-sync";
import type { MetadataParser } from "../import/metadata-parser";

const service = new FolderSyncService({ metadataParser: {} as MetadataParser });

const trackRow = (id: string, storagePath: string) => ({
  id: id as TrackId,
  title: id,
  artistName: "A",
  albumTitle: "",
  artistIds: [],
  albumId: "" as AlbumId,
  tagIds: [],
  source: "local_external",
  pinned: 1,
  state: "ready",
  storagePath,
  duration: 100,
  format: {},
  playCount: 0,
  addedAt: 1,
});

describe("FolderSyncService.removeSingleFile", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
  });

  it("drops the track's own cover together with the track row", async () => {
    await db.tracks.put(trackRow("t1", "C:/music/a.mp3"));
    await db.covers.put({
      id: "c1", ownerType: "track", ownerId: "t1", blob: new Blob(), mimeType: "image/webp", addedAt: 1, updatedAt: 1,
    });

    const removed = await service.removeSingleFile("C:/music/a.mp3");

    expect(removed).toBe(true);
    expect(await db.tracks.get("t1")).toBeUndefined();
    expect(await db.covers.count()).toBe(0);
  });
});
