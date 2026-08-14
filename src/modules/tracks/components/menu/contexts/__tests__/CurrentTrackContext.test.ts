import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { defineComponent, h } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import { TrackSource, TrackState } from "@/db/entities";
import type { PlayerTrack, Track } from "@/modules/player/types";
import { provideTrackMenuComponents } from "../../useTrackMenuComponents";
import CurrentTrackContext from "../CurrentTrackContext.vue";

const importCurrentMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/tracks/composables/useEphemeralImport", async () => {
  const { computed, ref, toValue } = await import("vue");
  const { ephemeralFilePath } = await import("@/modules/tracks/lib/trackPredicates");
  return {
    useEphemeralImport: (track: unknown) => ({
      importPath: computed(() => ephemeralFilePath(toValue(track) as PlayerTrack | null)),
      isRunning: ref(false),
      importCurrent: importCurrentMock,
    }),
  };
});
vi.mock("@/modules/youtube/composables/useYoutube", () => ({
  useYoutube: () => ({ download: vi.fn() }),
}));

const stubbedItems = {
  ShowLyricsItem: true,
  LikeItem: true,
  ExportFileItem: true,
  LyricsItem: true,
  AddToPlaylistSub: true,
  OfflineItem: true,
  SourceItems: true,
  NavigationItems: true,
  DetailsItem: true,
  PlayItems: true,
};

/** Menu items resolve via injection — the host provides plain buttons. */
const Host = defineComponent({
  props: { track: { type: Object, required: true } },
  setup(props) {
    provideTrackMenuComponents({
      Item: defineComponent((_, { slots, attrs }) => () => h("button", attrs, slots.default?.())),
      Separator: defineComponent(() => () => h("hr")),
      Sub: defineComponent((_, { slots }) => () => h("div", slots.default?.())),
      SubTrigger: defineComponent((_, { slots }) => () => h("div", slots.default?.())),
      SubContent: defineComponent((_, { slots }) => () => h("div", slots.default?.())),
    });
    const actions = new Proxy({}, { get: () => vi.fn() });
    return () => h(CurrentTrackContext, { track: props.track as PlayerTrack, actions, caps: null });
  },
});

function renderWithTrack(track: PlayerTrack) {
  return render(Host, {
    props: { track },
    global: { plugins: [i18n], stubs: stubbedItems },
  });
}

function libraryTrack(): Track {
  return {
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
    duration: 100,
    isLiked: false,
  };
}

describe("CurrentTrackContext import CTA", () => {
  beforeEach(() => {
    i18n.global.locale.value = "en";
    importCurrentMock.mockReset();
  });

  it("shows the import item for an open-with ephemeral track and runs the import", async () => {
    renderWithTrack({
      kind: "ephemeral",
      id: "eph-1",
      title: "Open-with file",
      source: { type: "path", path: "C:/Music/x.flac" },
    });

    const item = screen.getByText("Import to library");
    await userEvent.click(item);

    expect(importCurrentMock).toHaveBeenCalledTimes(1);
  });

  it("hides the import item for library tracks", () => {
    renderWithTrack(libraryTrack());

    expect(screen.queryByText("Import to library")).toBeNull();
  });
});
