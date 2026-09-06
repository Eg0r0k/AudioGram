import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref } from "vue";
import { TrackSource, TrackState } from "@/db/entities";
import type { Track } from "@/modules/player/types";
import { TrackId } from "@/types/ids";

const queries = vi.hoisted(() => ({
  getTracksByIdsSorted: vi.fn(),
  setTracksLikedAndSync: vi.fn(),
}));
const undoApi = vi.hoisted(() => ({ deleteTracksWithUndo: vi.fn() }));
const playlistQueries = vi.hoisted(() => ({ addTracksToPlaylistAndSync: vi.fn() }));
const dialog = vi.hoisted(() => ({ summonDialog: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const queue = vi.hoisted(() => ({
  queue: [] as { id: string; track: { id: string } }[],
  setQueue: vi.fn(async () => {}),
  insertMultipleNext: vi.fn(),
  addMultipleToQueue: vi.fn(),
  removeMultiple: vi.fn(async () => {}),
  syncTracksMetadata: vi.fn(),
}));

vi.mock("@/queries/track.queries", () => queries);
vi.mock("@/queries/track-undo", () => undoApi);
vi.mock("@/queries/playlist.queries", () => playlistQueries);
vi.mock("@/components/dialogs/summon", () => dialog);
vi.mock("vue-sonner", () => ({ toast }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ tag: "qc" }) }));
vi.mock("@/modules/queue/store/queue.store", () => ({ useQueueStore: () => queue }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ warn: vi.fn() }) }));

import { useBulkTrackActions } from "../useBulkTrackActions";

const makeTrack = (id: string, isLiked = false): Track => ({
  kind: "library",
  id: TrackId(id),
  title: id,
  artist: "Artist",
  artistIds: [],
  albumId: "a1" as Track["albumId"],
  albumName: "Album",
  storagePath: `tracks/${id}.mp3`,
  source: TrackSource.LOCAL_INTERNAL,
  state: TrackState.READY,
  duration: 100,
  isLiked,
});

const setup = (selected: string[], loaded: Track[] = [makeTrack("t1"), makeTrack("t2", true)]) => {
  const onDone = vi.fn();
  const scope = effectScope();
  const actions = scope.run(() => useBulkTrackActions({
    selectedIds: computed(() => new Set(selected)),
    loadedTracks: ref(loaded),
    sortKey: ref("title_asc" as const),
    onDone,
  }))!;
  return { actions, onDone };
};

describe("useBulkTrackActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queue.queue = [];
    queries.getTracksByIdsSorted.mockResolvedValue([makeTrack("t1"), makeTrack("t2")]);
  });

  it("play replaces the queue with the sorted selection and reports done", async () => {
    const { actions, onDone } = setup(["t1", "t2"]);

    await actions.play();

    expect(queries.getTracksByIdsSorted).toHaveBeenCalledWith(["t1", "t2"], "title_asc");
    expect(queue.setQueue).toHaveBeenCalledWith(expect.any(Array), 0, { type: "manual" });
    expect(onDone).toHaveBeenCalledWith("play");
  });

  it("does nothing with an empty selection", async () => {
    const { actions, onDone } = setup([]);
    await actions.play();
    await actions.addToQueue();
    expect(queue.setQueue).not.toHaveBeenCalled();
    expect(queue.addMultipleToQueue).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("playNext and addToQueue go through the batched queue methods", async () => {
    const { actions } = setup(["t1", "t2"]);

    await actions.playNext();
    await actions.addToQueue();

    expect(queue.insertMultipleNext).toHaveBeenCalledTimes(1);
    expect(queue.addMultipleToQueue).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledTimes(2);
  });

  it("allLiked is false while a known selected track is not liked, true when all known are liked", () => {
    expect(setup(["t1", "t2"]).actions.allLiked.value).toBe(false);
    expect(setup(["t2"]).actions.allLiked.value).toBe(true);
    expect(setup(["ghost"]).actions.allLiked.value).toBe(false);
  });

  it("toggleLike likes when not all liked and patches queue copies", async () => {
    queries.setTracksLikedAndSync.mockResolvedValue(2);
    queue.queue = [{ id: "q1", track: makeTrack("t1") }];
    const { actions } = setup(["t1", "t2"]);

    await actions.toggleLike();

    expect(queries.setTracksLikedAndSync).toHaveBeenCalledWith({ tag: "qc" }, ["t1", "t2"], true);
    expect(queue.syncTracksMetadata).toHaveBeenCalledTimes(1);
    expect(queue.syncTracksMetadata).toHaveBeenCalledWith([expect.objectContaining({ id: "t1", isLiked: true })]);
    expect(toast.success).toHaveBeenCalledWith("library.selection.liked");
  });

  it("toggleLike unlikes when every known selected track is liked", async () => {
    queries.setTracksLikedAndSync.mockResolvedValue(1);
    const { actions } = setup(["t2"]);

    await actions.toggleLike();

    expect(queries.setTracksLikedAndSync).toHaveBeenCalledWith({ tag: "qc" }, ["t2"], false);
  });

  it("addToPlaylist resolves tracks then calls the batched playlist add", async () => {
    const { actions } = setup(["t1", "t2"]);

    await actions.addToPlaylist("pl-1" as never);

    expect(playlistQueries.addTracksToPlaylistAndSync).toHaveBeenCalledWith({ tag: "qc" }, "pl-1", expect.any(Array));
    expect(toast.success).toHaveBeenCalledWith("library.selection.addedToPlaylist");
  });

  it("deleteSelected asks for confirmation and stops when dismissed", async () => {
    dialog.summonDialog.mockResolvedValue(undefined);
    const { actions, onDone } = setup(["t1"]);

    await actions.deleteSelected();

    expect(dialog.summonDialog).toHaveBeenCalledWith(expect.anything(), { count: 1 }, { key: "delete-tracks" });
    expect(undoApi.deleteTracksWithUndo).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("deleteSelected deletes in one call, drops queue entries, reports done", async () => {
    dialog.summonDialog.mockResolvedValue(true);
    undoApi.deleteTracksWithUndo.mockResolvedValue({ deleted: 2, restore: vi.fn(), finalize: vi.fn() });
    queue.queue = [{ id: "q1", track: makeTrack("t1") }, { id: "q2", track: makeTrack("zzz") }];
    const { actions, onDone } = setup(["t1", "t2"]);

    await actions.deleteSelected();

    expect(undoApi.deleteTracksWithUndo).toHaveBeenCalledWith({ tag: "qc" }, ["t1", "t2"]);
    expect(queue.removeMultiple).toHaveBeenCalledWith(["q1"]);
    expect(toast.success).toHaveBeenCalledWith("library.selection.deleted", expect.objectContaining({
      action: expect.objectContaining({ label: "common.undo" }),
    }));
    expect(onDone).toHaveBeenCalledWith("delete");
  });

  it("a failing action toasts an error, keeps busy false and does not report done", async () => {
    queries.getTracksByIdsSorted.mockRejectedValue(new Error("boom"));
    const { actions, onDone } = setup(["t1"]);

    await actions.play();

    expect(toast.error).toHaveBeenCalledWith("library.selection.actionFailed");
    expect(actions.busy.value).toBe(false);
    expect(onDone).not.toHaveBeenCalled();
  });
});
