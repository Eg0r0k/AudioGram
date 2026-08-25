import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, reactive, toValue } from "vue";
import type { QueueItem, QueueSource } from "@/modules/queue/types";
import type { PlayerTrack } from "@/modules/player/types";

const mockQueueState = reactive({
  currentItem: null as QueueItem | null,
});

// Detail rows the "database" knows about, keyed by entity kind + id.
const rows = reactive<Record<string, { title?: string; name?: string } | undefined>>({});

vi.mock("@/modules/queue/store/queue.store", () => ({
  useQueueStore: () => mockQueueState,
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/queries/album.queries", () => ({
  albumQueries: { detail: (id: string, enabled: boolean) => ({ kind: "album", id, enabled }) },
}));
vi.mock("@/queries/artist.queries", () => ({
  artistQueries: { detail: (id: string, enabled: boolean) => ({ kind: "artist", id, enabled }) },
}));
vi.mock("@/queries/playlist.queries", () => ({
  playlistQueries: { detail: (id: string, enabled: boolean) => ({ kind: "playlist", id, enabled }) },
}));

// The composable only reads `data`; resolve it synchronously off `rows`
// so the test never needs a QueryClient. A disabled query yields nothing.
vi.mock("@tanstack/vue-query", () => ({
  useQuery: (options: unknown) => ({
    data: computed(() => {
      const { kind, id, enabled } = toValue(options) as { kind: string; id: string; enabled: boolean };
      return enabled ? rows[`${kind}:${id}`] : undefined;
    }),
  }),
}));

import { useQueueSourceLink } from "../useQueueSourceLink";

const track = (overrides: Partial<PlayerTrack> = {}): PlayerTrack => ({
  kind: "ephemeral",
  id: "eph-1",
  title: "Song",
  artist: "Catalog Artist",
  albumName: "Catalog Album",
  source: { type: "url", url: "https://stream" },
  ...overrides,
} as PlayerTrack);

const setSource = (source: QueueSource, current: PlayerTrack = track()) => {
  mockQueueState.currentItem = { id: "q1" as QueueItem["id"], track: current, source, addedAt: 0 };
};

describe("useQueueSourceLink", () => {
  beforeEach(() => {
    mockQueueState.currentItem = null;
    for (const key of Object.keys(rows)) delete rows[key];
  });

  it("is null with an empty queue", () => {
    expect(useQueueSourceLink().link.value).toBeNull();
  });

  it.each<QueueSource["type"]>(["search", "manual", "history", "recommendation", "external", "unknown"])(
    "is null for a %s origin, which has no page",
    (type) => {
      setSource({ type } as QueueSource);
      expect(useQueueSourceLink().link.value).toBeNull();
    },
  );

  it("names a library album through its detail query", () => {
    rows["album:a1"] = { title: "Discovery" };
    setSource({ type: "album", albumId: "a1" as never });

    expect(useQueueSourceLink().link.value).toEqual({
      label: "Discovery",
      to: { name: "album", params: { id: "a1" } },
    });
  });

  it("stays null until the album row is loaded", () => {
    setSource({ type: "album", albumId: "a1" as never });
    const { link } = useQueueSourceLink();
    expect(link.value).toBeNull();

    rows["album:a1"] = { title: "Discovery" };
    expect(link.value?.label).toBe("Discovery");
  });

  it("names a catalog album off the track instead of the database", () => {
    setSource({ type: "album", albumId: "nd:album:x" as never });

    expect(useQueueSourceLink().link.value).toEqual({
      label: "Catalog Album",
      to: { name: "album", params: { id: "nd:album:x" } },
    });
  });

  it("names a library artist and a playlist", () => {
    rows["artist:ar1"] = { name: "Daft Punk" };
    setSource({ type: "artist", artistId: "ar1" as never });
    expect(useQueueSourceLink().link.value).toEqual({
      label: "Daft Punk",
      to: { name: "artist", params: { id: "ar1" } },
    });

    rows["playlist:p1"] = { name: "Road trip" };
    setSource({ type: "playlist", playlistId: "p1" as never });
    expect(useQueueSourceLink().link.value).toEqual({
      label: "Road trip",
      to: { name: "playlist", params: { id: "p1" } },
    });
  });

  it("labels liked and the whole library with translated names", () => {
    setSource({ type: "liked" });
    expect(useQueueSourceLink().link.value).toEqual({ label: "media.type.liked", to: { name: "liked" } });

    setSource({ type: "allMedia" });
    expect(useQueueSourceLink().link.value).toEqual({ label: "library.allMusic.title", to: { name: "all-music" } });
  });
});
