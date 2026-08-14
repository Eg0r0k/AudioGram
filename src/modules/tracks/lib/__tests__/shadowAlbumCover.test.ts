import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { ytAlbumId } from "@/types/track-ref";
import { ensureShadowAlbumCover } from "../shadowAlbumCover";

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/modules/sources", () => ({
  sources: {
    get: () => ({ coverUrl: (ref: string) => `proxied://${ref}` }),
  },
}));

const albumId = ytAlbumId("MPREb_1");

describe("ensureShadowAlbumCover", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
    vi.restoreAllMocks();
  });

  it("fetches the proxied cover and stores it for the album", async () => {
    const blob = new Blob(["img"], { type: "image/jpeg" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(blob, { status: 200 })));

    await ensureShadowAlbumCover(albumId, "https://i.ytimg.com/vi/x/hq.jpg");

    expect(fetch).toHaveBeenCalledWith("proxied://https://i.ytimg.com/vi/x/hq.jpg");
    const cover = await db.covers.where("[ownerType+ownerId]").equals(["album", albumId]).first();
    expect(cover).toMatchObject({ ownerType: "album", ownerId: albumId });
  });

  it("does nothing when the album already has a cover", async () => {
    await db.covers.put({
      id: "c1", ownerType: "album", ownerId: albumId, blob: new Blob(), mimeType: "image/webp", addedAt: 1, updatedAt: 1,
    });
    vi.stubGlobal("fetch", vi.fn());

    await ensureShadowAlbumCover(albumId, "ref");

    expect(fetch).not.toHaveBeenCalled();
    expect(await db.covers.count()).toBe(1);
  });

  it("swallows fetch failures without touching the covers table", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    await ensureShadowAlbumCover(albumId, "ref");

    expect(await db.covers.count()).toBe(0);
  });
});
