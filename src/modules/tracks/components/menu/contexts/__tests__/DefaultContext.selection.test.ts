import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import { TrackSource, TrackState } from "@/db/entities";
import type { Track } from "@/modules/player/types";
import { TrackId } from "@/types/ids";
import { provideTrackMenuComponents } from "../../useTrackMenuComponents";
import { provideTrackSelectionEntry } from "../../useTrackSelectionEntry";
import DefaultContext from "../DefaultContext.vue";

const stubbedItems = {
  PlayItems: true,
  LikeItem: true,
  AddToPlaylistSub: true,
  OfflineItem: true,
  MoreSub: true,
  NavigationItems: true,
  DetailsItem: true,
};

const track: Track = {
  kind: "library",
  id: TrackId("t1"),
  title: "One",
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

const Host = defineComponent({
  props: { enter: { type: Function, required: false } },
  setup(props) {
    provideTrackMenuComponents({
      Item: defineComponent((_, { slots, attrs }) => () => h("button", attrs, slots.default?.())),
      Separator: defineComponent(() => () => h("hr")),
      Sub: defineComponent((_, { slots }) => () => h("div", slots.default?.())),
      SubTrigger: defineComponent((_, { slots }) => () => h("div", slots.default?.())),
      SubContent: defineComponent((_, { slots }) => () => h("div", slots.default?.())),
    });
    if (props.enter) provideTrackSelectionEntry(props.enter as (id: TrackId) => void);
    const actions = new Proxy({}, { get: () => vi.fn() });
    return () => h(DefaultContext, { track, actions, caps: null });
  },
});

describe("DefaultContext selection entry", () => {
  it("has no Select item without a provider", () => {
    i18n.global.locale.value = "en";
    render(Host, { global: { plugins: [i18n], stubs: stubbedItems } });
    expect(screen.queryByRole("button", { name: "Select" })).toBeNull();
  });

  it("renders Select and calls the provided entry with the track id", async () => {
    i18n.global.locale.value = "en";
    const enter = vi.fn();
    render(Host, { props: { enter }, global: { plugins: [i18n], stubs: stubbedItems } });

    await userEvent.setup().click(screen.getByRole("button", { name: "Select" }));

    expect(enter).toHaveBeenCalledWith("t1");
  });
});
