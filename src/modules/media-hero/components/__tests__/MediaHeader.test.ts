import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import { scrollableInjectionKey, type ScrollableContext } from "@/components/ui/scrollable/injection";
import type { QueueItem, QueueSource } from "@/modules/queue/types";
import type { AlbumId } from "@/types/ids";
import MediaHeader from "../MediaHeader.vue";

const togglePlay = vi.fn(async () => {});
const mockPlayerState = reactive({
  isPlaying: false,
  showLoadingIndicator: false,
  togglePlay,
});
const mockQueueState = reactive({
  queue: [] as Array<Pick<QueueItem, "source">>,
  currentIndex: -1,
});

vi.mock("@/modules/player/store/player.store", () => ({
  usePlayerStore: () => mockPlayerState,
}));
vi.mock("@/modules/queue/store/queue.store", () => ({
  useQueueStore: () => mockQueueState,
}));
vi.mock("@/composables/useGoBack", () => ({
  useGoBack: () => vi.fn(),
}));

const albumSource = (id: string): QueueSource => ({ type: "album", albumId: id as AlbumId });

// The sticky play button only exists once the page is scrolled past the hero.
const scrolledContext = { scrollPosition: ref(200) } as unknown as ScrollableContext;

const renderHeader = (source?: QueueSource) =>
  render(MediaHeader, {
    props: { title: "Album", source },
    global: {
      plugins: [i18n],
      provide: { [scrollableInjectionKey as symbol]: scrolledContext },
    },
  });

describe("MediaHeader", () => {
  beforeEach(() => {
    togglePlay.mockClear();
    mockPlayerState.isPlaying = false;
    mockPlayerState.showLoadingIndicator = false;
    mockQueueState.queue = [];
    mockQueueState.currentIndex = -1;
  });

  it("emits play when the entity is not the active source", async () => {
    const { emitted } = renderHeader(albumSource("album-1"));

    await userEvent.click(screen.getByRole("button", { name: i18n.global.t("player.play") }));

    expect(emitted().play).toHaveLength(1);
    expect(togglePlay).not.toHaveBeenCalled();
  });

  it("shows pause and toggles playback while the entity is playing", async () => {
    mockQueueState.queue = [{ source: albumSource("album-1") }];
    mockQueueState.currentIndex = 0;
    mockPlayerState.isPlaying = true;
    const { emitted } = renderHeader(albumSource("album-1"));

    await userEvent.click(screen.getByRole("button", { name: i18n.global.t("player.pause") }));

    expect(togglePlay).toHaveBeenCalledTimes(1);
    expect(emitted().play).toBeUndefined();
  });

  it("resumes the paused entity via togglePlay instead of restarting it", async () => {
    mockQueueState.queue = [{ source: albumSource("album-1") }];
    mockQueueState.currentIndex = 0;
    const { emitted } = renderHeader(albumSource("album-1"));

    await userEvent.click(screen.getByRole("button", { name: i18n.global.t("player.play") }));

    expect(togglePlay).toHaveBeenCalledTimes(1);
    expect(emitted().play).toBeUndefined();
  });

  it("keeps the plain play behaviour without a source", async () => {
    mockQueueState.queue = [{ source: albumSource("album-1") }];
    mockQueueState.currentIndex = 0;
    mockPlayerState.isPlaying = true;
    const { emitted } = renderHeader();

    await userEvent.click(screen.getByRole("button", { name: i18n.global.t("player.play") }));

    expect(emitted().play).toHaveLength(1);
    expect(togglePlay).not.toHaveBeenCalled();
  });
});
