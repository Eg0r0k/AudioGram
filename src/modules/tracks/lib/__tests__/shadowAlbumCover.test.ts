import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { queryClient } from "@/queries/client";
import { queryKeys } from "@/queries/query-keys";
import { ytAlbumId, ytTrackId } from "@/types/track-ref";
import { ensureShadowCover } from "../shadowAlbumCover";

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ getLogger: () => logger }));
vi.mock("@/modules/sources", () => ({
  sources: {
    get: () => ({ coverUrl: (ref: string) => `proxied://${ref}` }),
  },
}));

const albumId = ytAlbumId("MPREb_1");
const trackId = ytTrackId("dWYO_I3DZzc");

describe("ensureShadowCover", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
    queryClient.clear();
    vi.restoreAllMocks();
    logger.warn.mockClear();
  });

  it("fetches the proxied cover and stores it for the album", async () => {
    const blob = new Blob(["img"], { type: "image/jpeg" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(blob, { status: 200 })));

    await ensureShadowCover("album", albumId, "https://i.ytimg.com/vi/x/hq.jpg");

    expect(fetch).toHaveBeenCalledWith("proxied://https://i.ytimg.com/vi/x/hq.jpg");
    const cover = await db.covers.where("[ownerType+ownerId]").equals(["album", albumId]).first();
    expect(cover).toMatchObject({ ownerType: "album", ownerId: albumId });
  });

  it("stores an album-less track's cover under the track itself", async () => {
    const blob = new Blob(["img"], { type: "image/jpeg" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(blob, { status: 200 })));

    await ensureShadowCover("track", trackId, "https://i.ytimg.com/vi/x/hq.jpg");

    const cover = await db.covers.where("[ownerType+ownerId]").equals(["track", trackId]).first();
    expect(cover).toMatchObject({ ownerType: "track", ownerId: trackId });
    expect(queryClient.getQueryData<Blob>(queryKeys.covers.detail("track", trackId))).toBeInstanceOf(Blob);
  });

  it("syncs the freshly stored cover into the query cache", async () => {
    const blob = new Blob(["img"], { type: "image/jpeg" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(blob, { status: 200 })));

    await ensureShadowCover("album", albumId, "ref");

    const cached = queryClient.getQueryData<Blob>(queryKeys.covers.detail("album", albumId));
    expect(cached).toBeInstanceOf(Blob);
  });

  it("does nothing when the owner already has a cover", async () => {
    await db.covers.put({
      id: "c1", ownerType: "album", ownerId: albumId, blob: new Blob(), mimeType: "image/webp", addedAt: 1, updatedAt: 1,
    });
    vi.stubGlobal("fetch", vi.fn());

    await ensureShadowCover("album", albumId, "ref");

    expect(fetch).not.toHaveBeenCalled();
    expect(await db.covers.count()).toBe(1);
  });

  it("logs and leaves the covers table alone when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    await ensureShadowCover("album", albumId, "ref");

    expect(await db.covers.count()).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/404/));
  });
});
