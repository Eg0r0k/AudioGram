import { beforeEach, describe, expect, it, vi } from "vitest";
import { DbError } from "@/db/errors/db.errors";
import { TrackSource } from "@/db/entities";
import type { TrackId } from "@/types/ids";
import type { SyncResult } from "@/types/watched-folders";
import { FolderSyncService } from "../import/folder-sync";
import type { MetadataParser } from "../import/metadata-parser";
import type { TrackToSave } from "../types";

const { mockPersistTracks } = vi.hoisted(() => ({ mockPersistTracks: vi.fn() }));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("../import/track-persister", () => ({ persistTracks: mockPersistTracks }));
vi.mock("../entity-resolver", () => ({
  EntityResolver: class { resolve = vi.fn().mockResolvedValue(undefined); },
}));

const item = (id: string): TrackToSave => ({
  trackId: id as TrackId,
  fileName: `${id}.mp3`,
  storagePath: `C:/music/${id}.mp3`,
  fingerprint: `fp-${id}`,
  source: TrackSource.LOCAL_EXTERNAL,
  meta: { title: id, artists: ["A"], album: "", duration: 1, format: {} },
});

describe("FolderSyncService.persistParsed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stops after a quota failure and fails the untried batches", async () => {
    mockPersistTracks.mockRejectedValue(new DbError("QUOTA", "full"));
    const service = new FolderSyncService({ metadataParser: {} as MetadataParser });
    const result: SyncResult = { folderId: "f", added: 0, removed: 0, failed: 0, errors: [] };
    const parsed = Array.from({ length: 120 }, (_, i) => item(`t${i}`)); // 3 DB batches of 50/50/20
    const advance = vi.fn();

    await (service as unknown as {
      persistParsed: (p: TrackToSave[], f: string, r: SyncResult, a: (n: number) => void) => Promise<void>;
    }).persistParsed(parsed, "C:/music", result, advance);

    expect(mockPersistTracks).toHaveBeenCalledTimes(1);
    expect(result.added).toBe(0);
    expect(result.failed).toBe(120);
    expect(advance.mock.calls.reduce((sum, [n]) => sum + n, 0)).toBe(120);
  });
});
