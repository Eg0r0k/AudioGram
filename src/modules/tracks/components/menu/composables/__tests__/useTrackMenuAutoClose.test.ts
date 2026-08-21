import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, reactive, shallowRef, type Ref } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { Track } from "@/modules/player/types";
import { queryKeys } from "@/queries/query-keys";
import { PlaylistId, QueueItemId, TrackId } from "@/types/ids";

const queueState = reactive({
  upcomingItems: [] as { id: QueueItemId }[],
});

vi.mock("@/modules/queue/store/queue.store", () => ({
  useQueueStore: () => queueState,
}));

// Real queryFn shape (the composable must never observe this key with
// skipToken — see the invalidation regression below); rejects by default so
// seeded-cache tests keep their data exactly like the real db-less env.
const fetchPlaylistMock = vi.hoisted(() =>
  vi.fn<(id: unknown) => Promise<unknown>>(async () => {
    throw new Error("no playlist backend in this test");
  }));
vi.mock("@/queries/playlist.queries", () => ({
  playlistQueries: {
    detail: (id: unknown, enabled = true) => ({
      queryKey: ["playlists", id],
      queryFn: () => fetchPlaylistMock(id),
      enabled,
    }),
  },
}));

import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import { useTrackMenuAutoClose } from "../useTrackMenuAutoClose";
import type { TrackContext } from "../../type";

const PLAYLIST_ID = PlaylistId("playlist-1");

function makeTrack(id = "track-1"): Track {
  return {
    kind: "library",
    id: TrackId(id),
    title: "Test track",
    artist: "Test artist",
    artistIds: [],
    albumId: "album-1",
    albumName: "Test album",
    storagePath: "music/test.mp3",
    source: 0,
    state: 0,
    duration: 100,
    isLiked: false,
  } as unknown as Track;
}

function mountAutoClose(
  isOpen: Ref<boolean>,
  context: TrackContext,
  queryClient: QueryClient,
) {
  return mount(defineComponent({
    setup() {
      useTrackMenuAutoClose(isOpen, {
        context,
        playlistId: () => (context === "playlist" ? PLAYLIST_ID : undefined),
      });
      return () => h("div");
    },
  }), { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
}

describe("useTrackMenuAutoClose", () => {
  const menu = useTrackMenu();

  beforeEach(() => {
    queueState.upcomingItems = [];
    menu.closeMenu();
    menu.closeDropdown();
  });

  describe("контекст queue", () => {
    it("закрывает меню, когда элемент исчез из предстоящих", async () => {
      const itemId = QueueItemId("q-1");
      queueState.upcomingItems = [{ id: itemId }, { id: QueueItemId("q-2") }];

      menu.openMenu(makeTrack(), 0, { queueItemId: itemId, target: "queue" });
      const isOpen = shallowRef(true);
      const wrapper = mountAutoClose(isOpen, "queue", createQueryClient());

      queueState.upcomingItems = [{ id: QueueItemId("q-2") }];
      await nextTick();

      expect(menu.isContextMenuOpen.value).toBe(false);
      wrapper.unmount();
    });

    it("не закрывает, пока элемент на месте", async () => {
      const itemId = QueueItemId("q-1");
      queueState.upcomingItems = [{ id: itemId }];

      menu.openMenu(makeTrack(), 0, { queueItemId: itemId, target: "queue" });
      const isOpen = shallowRef(true);
      const wrapper = mountAutoClose(isOpen, "queue", createQueryClient());

      queueState.upcomingItems = [{ id: itemId }, { id: QueueItemId("q-2") }];
      await nextTick();

      expect(menu.isContextMenuOpen.value).toBe(true);
      wrapper.unmount();
    });

    it("не реагирует при закрытом меню", async () => {
      const itemId = QueueItemId("q-1");
      queueState.upcomingItems = [{ id: itemId }];

      menu.openMenu(makeTrack(), 0, { queueItemId: itemId, target: "queue" });
      const isOpen = shallowRef(false);
      const wrapper = mountAutoClose(isOpen, "queue", createQueryClient());

      queueState.upcomingItems = [];
      await nextTick();

      expect(menu.isContextMenuOpen.value).toBe(true);
      wrapper.unmount();
    });
  });

  describe("контекст playlist", () => {
    it("рефетчит деталь плейлиста при инвалидации — регресс skipToken-спама после добавления треков", async () => {
      const track = makeTrack("t-1");
      const queryClient = createQueryClient();
      const flush = () => new Promise(resolve => setTimeout(resolve, 0));

      fetchPlaylistMock.mockResolvedValueOnce({
        id: PLAYLIST_ID,
        name: "P",
        trackIds: [track.id],
      });

      menu.openMenu(track, 0, { target: "playlist" });
      const isOpen = shallowRef(true);
      const wrapper = mountAutoClose(isOpen, "playlist", queryClient);
      await flush();
      expect(fetchPlaylistMock).toHaveBeenCalledTimes(1);
      expect(menu.isContextMenuOpen.value).toBe(true);

      // The add-tracks mutation invalidates ["playlists", id]; the observer
      // must refetch through its real queryFn (skipToken here produced
      // "Attempted to invoke queryFn when set to skipToken" retry spam).
      fetchPlaylistMock.mockResolvedValueOnce({
        id: PLAYLIST_ID,
        name: "P",
        trackIds: [],
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.playlists.detail(PLAYLIST_ID) });
      await flush();
      await nextTick();

      expect(fetchPlaylistMock).toHaveBeenCalledTimes(2);
      expect(menu.isContextMenuOpen.value).toBe(false);
      wrapper.unmount();
    });

    it("закрывает меню, когда трек удалён из кэша плейлиста", async () => {
      const track = makeTrack("t-1");
      const queryClient = createQueryClient();
      queryClient.setQueryData(queryKeys.playlists.detail(PLAYLIST_ID), {
        id: PLAYLIST_ID,
        name: "P",
        trackIds: [track.id, "t-2"],
      });

      menu.openMenu(track, 0, { target: "playlist" });
      const isOpen = shallowRef(true);
      const wrapper = mountAutoClose(isOpen, "playlist", queryClient);
      await nextTick();

      queryClient.setQueryData(queryKeys.playlists.detail(PLAYLIST_ID), {
        id: PLAYLIST_ID,
        name: "P",
        trackIds: ["t-2"],
      });
      await nextTick();
      await nextTick();

      expect(menu.isContextMenuOpen.value).toBe(false);
      wrapper.unmount();
    });

    it("не закрывает при пустом кэше плейлиста", async () => {
      const track = makeTrack("t-1");

      menu.openMenu(track, 0, { target: "playlist" });
      const isOpen = shallowRef(true);
      const wrapper = mountAutoClose(isOpen, "playlist", createQueryClient());
      await nextTick();
      await nextTick();

      expect(menu.isContextMenuOpen.value).toBe(true);
      wrapper.unmount();
    });
  });
});
