import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import type { QueueItem, QueueSource } from "@/modules/queue/types";
import type { AlbumId, PlaylistId, QueueItemId } from "@/types/ids";

// The composable only reads state off the two stores; reactive() stand-ins
// keep its computeds re-evaluating on changes — no Pinia wiring needed.
const mockPlayerState = reactive({
  isPlaying: false,
  isLoading: false,
  showLoadingIndicator: false,
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

import { usePlaybackState } from "../usePlaybackState";

const albumSource = (id: string): QueueSource =>
  ({ type: "album", albumId: id as AlbumId });

function setCurrent(source: QueueSource) {
  mockQueueState.queue = [{ source }];
  mockQueueState.currentIndex = 0;
}

describe("usePlaybackState", () => {
  beforeEach(() => {
    mockPlayerState.isPlaying = false;
    mockPlayerState.isLoading = false;
    mockPlayerState.showLoadingIndicator = false;
    mockQueueState.queue = [];
    mockQueueState.currentIndex = -1;
  });

  it("is inactive when the queue is empty", () => {
    const { isActiveSource, isPlaying, isLoading } = usePlaybackState(
      () => albumSource("album-1"),
    );

    expect(isActiveSource.value).toBe(false);
    expect(isPlaying.value).toBe(false);
    expect(isLoading.value).toBe(false);
  });

  it("is active when the current queue item comes from the same source", () => {
    setCurrent(albumSource("album-1"));

    const { isActiveSource } = usePlaybackState(() => albumSource("album-1"));

    expect(isActiveSource.value).toBe(true);
  });

  it("distinguishes sources of the same type by id", () => {
    setCurrent(albumSource("album-1"));

    const { isActiveSource } = usePlaybackState(() => albumSource("album-2"));

    expect(isActiveSource.value).toBe(false);
  });

  it("distinguishes sources by type", () => {
    setCurrent(albumSource("album-1"));

    const { isActiveSource } = usePlaybackState(
      () => ({ type: "playlist", playlistId: "album-1" as PlaylistId }),
    );

    expect(isActiveSource.value).toBe(false);
  });

  it("only reports playing/loading while the source is active", () => {
    mockPlayerState.isPlaying = true;
    mockPlayerState.isLoading = true;
    mockPlayerState.showLoadingIndicator = true;

    setCurrent(albumSource("album-1"));
    const active = usePlaybackState(() => albumSource("album-1"));
    const inactive = usePlaybackState(() => albumSource("album-2"));

    expect(active.isPlaying.value).toBe(true);
    expect(active.isLoading.value).toBe(true);
    expect(active.showLoadingIndicator.value).toBe(true);
    expect(inactive.isPlaying.value).toBe(false);
    expect(inactive.isLoading.value).toBe(false);
    expect(inactive.showLoadingIndicator.value).toBe(false);
  });

  it("reports loading at once while the indicator waits for the store's delay", () => {
    // A start loads for tens of milliseconds; the pause icon must hold through
    // it, only spinners follow the delayed indicator.
    mockPlayerState.isLoading = true;
    setCurrent(albumSource("album-1"));
    const { isLoading, showLoadingIndicator } = usePlaybackState(() => albumSource("album-1"));

    expect(isLoading.value).toBe(true);
    expect(showLoadingIndicator.value).toBe(false);

    mockPlayerState.showLoadingIndicator = true;
    expect(showLoadingIndicator.value).toBe(true);
  });

  it("tracks queue position changes through the source getter", () => {
    mockQueueState.queue = [
      { source: albumSource("album-1"), id: "q1" as QueueItemId } as QueueItem,
      { source: albumSource("album-2"), id: "q2" as QueueItemId } as QueueItem,
    ];
    mockQueueState.currentIndex = 0;

    const { isActiveSource } = usePlaybackState(() => albumSource("album-2"));
    expect(isActiveSource.value).toBe(false);

    mockQueueState.currentIndex = 1;
    expect(isActiveSource.value).toBe(true);
  });
});
