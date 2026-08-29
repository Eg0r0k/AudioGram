import { fireEvent, render, screen } from "@testing-library/vue";
import { nextTick, ref } from "vue";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import { TrackSource, TrackState, type TrackChapterMark } from "@/db/entities";
import type { Track } from "@/modules/player/types";
import * as chaptersModule from "@/modules/tracks/composables/useTrackChapters";
import ChaptersPanel from "../ChaptersPanel.vue";

vi.mock("@/modules/tracks/composables/useTrackChapters", async () => {
  const { ref } = await import("vue");
  const data = ref<TrackChapterMark[]>([]);
  const mutate = vi.fn();
  const mutateAsync = vi.fn().mockResolvedValue(undefined);
  return {
    useTrackChapters: () => ({ data }),
    useSaveTrackChapters: () => ({ mutate, mutateAsync, isPending: ref(false) }),
    __mocks: { data, mutate, mutateAsync },
  };
});

const mocks = (chaptersModule as unknown as {
  __mocks: { data: ReturnType<typeof ref<TrackChapterMark[]>>; mutate: ReturnType<typeof vi.fn>; mutateAsync: ReturnType<typeof vi.fn> };
}).__mocks;

const slotStub = { template: "<div><slot /></div>" };
const stubs = {
  Scrollable: slotStub,
  RightPanelHeader: { template: `<div><slot name="leading" /><slot name="trailing" /></div>` },
};

const track = (): Track => ({
  kind: "library",
  id: "t1" as Track["id"],
  title: "Library",
  artist: "Artist",
  artistIds: [],
  albumId: "a1" as Track["albumId"],
  albumName: "Album",
  storagePath: "tracks/t1.mp3",
  source: TrackSource.LOCAL_INTERNAL,
  state: TrackState.READY,
  duration: 300,
  isLiked: false,
});

const renderPanel = () => render(ChaptersPanel, {
  props: { track: track() },
  global: { plugins: [i18n, VueQueryPlugin], stubs },
});

const enterEdit = async () => {
  await fireEvent.click(screen.getByRole("button", { name: "Edit chapters" }));
  await nextTick();
};

describe("ChaptersPanel", () => {
  beforeEach(() => {
    i18n.global.locale.value = "en";
    mocks.data.value = [];
    mocks.mutate.mockClear();
    mocks.mutateAsync.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets the user leave edit mode without saving", async () => {
    renderPanel();
    await enterEdit();
    expect(screen.getByRole("textbox")).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Cancel editing" }));
    await nextTick();

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps save enabled for an empty draft and exits without a write when nothing changed", async () => {
    renderPanel();
    await enterEdit();

    const save = screen.getByRole("button", { name: "Save chapters" });
    expect(save).not.toBeDisabled();

    await fireEvent.click(save);
    await nextTick();

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("restores the pre-edit chapters on cancel after the autosave already wrote the draft", async () => {
    vi.useFakeTimers();
    mocks.data.value = [{ time: 10, title: "Intro" }];
    renderPanel();
    await enterEdit();

    await fireEvent.update(screen.getByRole("textbox"), "00:05 - Changed");
    await nextTick();
    vi.advanceTimersByTime(1500);

    expect(mocks.mutate).toHaveBeenCalledWith({ trackId: "t1", chapters: [{ time: 5, title: "Changed" }] });
    // The query cache now reflects the autosaved draft.
    mocks.data.value = [{ time: 5, title: "Changed" }];
    await nextTick();

    await fireEvent.click(screen.getByRole("button", { name: "Cancel editing" }));
    await nextTick();

    expect(mocks.mutateAsync).toHaveBeenCalledWith({ trackId: "t1", chapters: [{ time: 10, title: "Intro" }] });
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
