import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/vue";
import { createI18n } from "vue-i18n";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { messages } from "@/app/i18n/messages";
import type { EphemeralTrack } from "@/modules/player/types";
import type { QueueItem } from "../types";
import { QueueItemId } from "@/types/ids";
import QueueItemRow from "../components/QueueItem.vue";

const YT_COVER = "http://127.0.0.1:9999/token/yt-thumb/abc.jpg";

const ephemeralItem = (): QueueItem => ({
  id: QueueItemId("q-1"),
  track: {
    kind: "ephemeral",
    id: "yt-1",
    title: "YT Track",
    artist: "Someone",
    cover: YT_COVER,
    source: { type: "url", url: "http://127.0.0.1:9999/token/yt/abc" },
  } satisfies EphemeralTrack,
  source: { type: "manual" },
  addedAt: 0,
});

const renderItem = (item: QueueItem) => render(QueueItemRow, {
  props: { item },
  global: {
    plugins: [
      createI18n({ legacy: false, locale: "en", messages }),
      VueQueryPlugin,
    ],
  },
});

describe("QueueItem cover resolution", () => {
  it("uses the ephemeral track's own artwork (YT thumbnail)", () => {
    const { container } = renderItem(ephemeralItem());
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(YT_COVER);
  });

  it("prefers an explicit item cover over the track artwork", () => {
    const item = { ...ephemeralItem(), cover: "/covers/override.png" };
    const { container } = renderItem(item);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/covers/override.png");
  });

  it("falls back to the placeholder when nothing carries artwork", () => {
    const item = ephemeralItem();
    (item.track as EphemeralTrack).cover = undefined;
    const { container } = renderItem(item);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/img/fallback.svg");
  });
});
