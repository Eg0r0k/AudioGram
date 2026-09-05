import { describe, expect, it, vi } from "vitest";
import { computed, effectScope, nextTick, ref } from "vue";
import { TrackSource, TrackState } from "@/db/entities";
import type { Track } from "@/modules/player/types";
import { TrackId } from "@/types/ids";
import { useTrackSelectionMode } from "../useTrackSelectionMode";

const makeTrack = (id: string): Track => ({
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
  isLiked: false,
});

const setup = (allIds: string[] = ["t1", "t2", "t3", "t4"]) => {
  const tracks = ref<Track[]>([makeTrack("t1"), makeTrack("t2")]);
  const total = ref(allIds.length);
  const resetKey = ref("title_asc|");
  const getAllIds = vi.fn(async () => allIds.map(TrackId));
  const scope = effectScope();
  const mode = scope.run(() => useTrackSelectionMode(tracks, ref<HTMLElement | null>(null), {
    getAllIds,
    total,
    resetKey: computed(() => resetKey.value),
  }))!;
  return { tracks, total, resetKey, getAllIds, mode, scope };
};

describe("useTrackSelectionMode", () => {
  it("enter(id) turns the mode on and selects that track", () => {
    const { mode } = setup();

    mode.enter(TrackId("t2"));

    expect(mode.isSelectMode.value).toBe(true);
    expect(mode.isSelected("t2")).toBe(true);
    expect(mode.selectedCount.value).toBe(1);
  });

  it("enter() without an id keeps an empty selection but the mode on", () => {
    const { mode } = setup();
    mode.enter();
    expect(mode.isSelectMode.value).toBe(true);
    expect(mode.selectedCount.value).toBe(0);
  });

  it("exit() clears the selection and turns the mode off", () => {
    const { mode } = setup();
    mode.enter(TrackId("t1"));

    mode.exit();

    expect(mode.isSelectMode.value).toBe(false);
    expect(mode.selectedCount.value).toBe(0);
  });

  it("an implicit selection (ctrl-click / long-press) turns the mode on", async () => {
    const { mode, tracks } = setup();

    mode.handleTrackSelect(tracks.value[0], new MouseEvent("click", { ctrlKey: true }));
    await nextTick();

    expect(mode.isSelectMode.value).toBe(true);
    expect(mode.isSelected("t1")).toBe(true);
  });

  it("selectAll pulls every id from getAllIds, beyond the loaded pages", async () => {
    const { mode, getAllIds } = setup();
    mode.enter();

    const pending = mode.selectAll();
    expect(mode.isSelectingAll.value).toBe(true);
    await pending;

    expect(getAllIds).toHaveBeenCalledTimes(1);
    expect(mode.isSelectingAll.value).toBe(false);
    expect(mode.selectedCount.value).toBe(4);
    expect(mode.isAllSelected.value).toBe(true);
  });

  it("isAllSelected drops as soon as one id is removed; deselectAll empties", async () => {
    const { mode } = setup();
    mode.enter();
    await mode.selectAll();

    mode.toggleById("t3");
    expect(mode.isAllSelected.value).toBe(false);

    mode.deselectAll();
    expect(mode.selectedCount.value).toBe(0);
    expect(mode.isSelectMode.value).toBe(true);
  });

  it("selected ids survive a list refetch that drops rows", async () => {
    const { mode, tracks } = setup();
    mode.enter();
    await mode.selectAll();

    tracks.value = [makeTrack("t1")];
    await nextTick();

    expect(mode.selectedCount.value).toBe(4);
  });

  it("changing resetKey exits the mode", async () => {
    const { mode, resetKey } = setup();
    mode.enter(TrackId("t1"));

    resetKey.value = "title_desc|";
    await nextTick();

    expect(mode.isSelectMode.value).toBe(false);
    expect(mode.selectedCount.value).toBe(0);
  });

  it("Escape exits the mode only while it is on", () => {
    const { mode } = setup();
    mode.enter(TrackId("t1"));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(mode.isSelectMode.value).toBe(false);
  });
});
