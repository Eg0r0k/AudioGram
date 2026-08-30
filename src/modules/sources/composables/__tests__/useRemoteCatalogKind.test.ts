import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { ok } from "neverthrow";

const rows = vi.hoisted(() => ({
  artists: new Map<string, { pinned: number }>(),
  albums: new Map<string, { pinned: number }>(),
  playlists: new Map<string, object>(),
}));

vi.mock("@/db/repositories", () => ({
  artistRepository: { findById: (id: string) => Promise.resolve(ok(rows.artists.get(id))) },
  albumRepository: { findById: (id: string) => Promise.resolve(ok(rows.albums.get(id))) },
  playlistRepository: { findById: (id: string) => Promise.resolve(ok(rows.playlists.get(id))) },
}));
vi.mock("../../registry", () => ({
  sources: {
    get: () => ({
      capabilities: {
        artists: { list: false, open: true },
        albums: { list: false, open: true },
        playlists: { list: false, open: true },
      },
    }),
  },
}));

import { useRemoteCatalogKind } from "../useRemoteCatalogKind";

const resolve = async (entity: "artists" | "albums" | "playlists", id: string) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let result!: ReturnType<typeof useRemoteCatalogKind>;
  mount(defineComponent({
    setup() {
      result = useRemoteCatalogKind(entity, ref(id));
      return () => h("div");
    },
  }), { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });

  await new Promise(r => setTimeout(r, 0));
  await nextTick();
  return result;
};

describe("useRemoteCatalogKind", () => {
  beforeEach(() => {
    rows.artists.clear();
    rows.albums.clear();
    rows.playlists.clear();
  });

  it("takes the local path for an unprefixed id without touching Dexie", async () => {
    const { remoteKind, isResolved } = await resolve("artists", "local-uuid");

    expect(remoteKind.value).toBeNull();
    expect(isResolved.value).toBe(true);
  });

  it("opens the catalog for a remote id with no library row", async () => {
    const { remoteKind } = await resolve("albums", "yt:MPREb_x");

    expect(remoteKind.value).toBe("yt");
  });

  // The regression: downloading a YouTube track pins an artist row under the
  // same "yt:" id, the local search index lists it, and opening that result
  // must show the library artist rather than the live YouTube page.
  it("takes the local path when a pinned library row exists under the remote id", async () => {
    rows.artists.set("yt:UC1", { pinned: 1 });

    const { remoteKind, isLibraryEntity } = await resolve("artists", "yt:UC1");

    expect(isLibraryEntity.value).toBe(true);
    expect(remoteKind.value).toBeNull();
  });

  // A shadow row hangs off a download and carries no library meaning, so
  // browsing the catalog entity it came from must still work.
  it("keeps the catalog path when the only row is an unpinned shadow", async () => {
    rows.albums.set("nd:al1", { pinned: 0 });

    const { remoteKind } = await resolve("albums", "nd:al1");

    expect(remoteKind.value).toBe("nd");
  });

  it("treats any existing playlist row as a library playlist", async () => {
    rows.playlists.set("nd:pl1", { id: "nd:pl1" });

    const { remoteKind } = await resolve("playlists", "nd:pl1");

    expect(remoteKind.value).toBeNull();
  });

  it("reports unresolved until the lookup settles, so no page renders twice", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let result!: ReturnType<typeof useRemoteCatalogKind>;
    mount(defineComponent({
      setup() {
        result = useRemoteCatalogKind("artists", ref("yt:UC1"));
        return () => h("div");
      },
    }), { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });

    expect(result.isResolved.value).toBe(false);
    expect(result.remoteKind.value).toBeNull();
  });
});
