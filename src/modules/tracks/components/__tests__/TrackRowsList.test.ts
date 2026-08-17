import { render } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { TrackSource, TrackState } from "@/db/entities";
import type { Track } from "@/modules/player/types";
import TrackRowsList from "../TrackRowsList.vue";

// Регрессия: контекстное меню reka открывается только с содержимого своего
// слота-триггера. Если TrackContextMenu отрендерен пустым соседом списка,
// правый клик по строкам никогда его не откроет (локальный поиск).

const makeTrack = (id: string): Track => ({
  kind: "library",
  id: id as Track["id"],
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

const stubs = {
  TrackRow: { template: "<div data-track-row />" },
  TrackContextMenu: { template: "<div data-testid='ctx-menu'><slot /></div>" },
  TrackDropdown: true,
};

describe("TrackRowsList", () => {
  it("renders the rows INSIDE the context-menu trigger slot", () => {
    const { container } = render(TrackRowsList, {
      props: { tracks: [makeTrack("t1"), makeTrack("t2")] },
      global: { stubs },
    });

    const menu = container.querySelector("[data-testid='ctx-menu']");
    expect(menu).not.toBeNull();
    expect(menu!.querySelectorAll("[data-track-row]")).toHaveLength(2);
  });
});
