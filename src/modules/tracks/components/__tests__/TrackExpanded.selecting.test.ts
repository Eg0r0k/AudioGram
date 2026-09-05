import { fireEvent, render } from "@testing-library/vue";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrackSource, TrackState } from "@/db/entities";
import type { Track } from "@/modules/player/types";
import { i18n } from "@/app/i18n";

// Regression: in select mode the row's artist/album links used to navigate,
// unmounting the page and throwing the whole selection away.

const pushMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => ({}),
}));
vi.mock("@/modules/tracks/composables/useTrackMenu", () => ({
  useTrackMenu: () => ({ openDropdown: vi.fn() }),
}));
vi.mock("@/modules/tracks/composables/useToggleTrackLike", () => ({
  useToggleTrackLike: () => ({ toggleTrackLike: vi.fn() }),
}));
vi.mock("@/modules/tracks/composables/useTrackRowCover", async () => {
  const { shallowRef } = await import("vue");
  return { useTrackRowCover: () => shallowRef("/img/fallback.svg") };
});

import TrackExpanded from "../TrackExpanded.vue";

const makeTrack = (id: string): Track => ({
  kind: "library",
  id: id as Track["id"],
  title: id,
  artist: "Artist One",
  artistIds: ["ar1" as Track["artistIds"][number]],
  albumId: "a1" as Track["albumId"],
  albumName: "Album One",
  storagePath: `tracks/${id}.mp3`,
  source: TrackSource.LOCAL_INTERNAL,
  state: TrackState.READY,
  duration: 100,
  isLiked: false,
});

const renderRow = (isSelecting: boolean, extra: Record<string, unknown> = {}) => render(TrackExpanded, {
  props: { track: makeTrack("t1"), index: 0, isSelecting, ...extra },
  global: {
    plugins: [createPinia(), i18n],
    directives: { ripple: {} },
    stubs: {
      NuxtImage: true,
      SourceDownloadButton: true,
    },
  },
});

describe("TrackExpanded in select mode", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("selects instead of navigating when the album link is clicked while selecting", async () => {
    const { getByRole, emitted } = renderRow(true);

    await fireEvent.click(getByRole("button", { name: "Album One" }));

    expect(emitted().select).toHaveLength(1);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("selects instead of navigating when the artist link is clicked while selecting", async () => {
    const { getByRole, emitted } = renderRow(true);

    await fireEvent.click(getByRole("button", { name: "Artist One" }));

    expect(emitted().select).toHaveLength(1);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("navigates from the album link when not selecting", async () => {
    const { getByRole, emitted } = renderRow(false);

    await fireEvent.click(getByRole("button", { name: "Album One" }));

    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(emitted().select).toBeUndefined();
  });

  it("navigates from the artist link when not selecting", async () => {
    const { getByRole } = renderRow(false);

    await fireEvent.click(getByRole("button", { name: "Artist One" }));

    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("ctrl-click plays on a page that did not opt into selection", async () => {
    const { container, emitted } = renderRow(false);

    await fireEvent.click(container.querySelector("[data-track-row]")!, { ctrlKey: true });

    expect(emitted().play).toHaveLength(1);
    expect(emitted().select).toBeUndefined();
  });

  it("ctrl-click selects on a selectable page", async () => {
    const { container, emitted } = renderRow(false, { selectable: true });

    await fireEvent.click(container.querySelector("[data-track-row]")!, { ctrlKey: true });

    expect(emitted().select).toHaveLength(1);
    expect(emitted().play).toBeUndefined();
  });

  it("marks joined corners so adjacent selected rows merge", () => {
    const { container } = renderRow(true, { isSelected: true, joinTop: true, joinBottom: false });
    const row = container.querySelector("[data-track-row]")!;

    expect(row.hasAttribute("data-join-top")).toBe(true);
    expect(row.hasAttribute("data-join-bottom")).toBe(false);
  });
});
