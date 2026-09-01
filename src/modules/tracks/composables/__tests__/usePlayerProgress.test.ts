import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPlayer = { currentTime: 0, duration: 200 };
const mockStore = {
  player: mockPlayer as { currentTime: number; duration: number } | null,
  isPlaying: false,
  status: "paused",
  currentTrack: { id: "t1" } as { id: string } | null,
  isLiveStream: false,
  canSeek: true,
  seekPercent: vi.fn(),
};

vi.mock("@/modules/player/store/player.store", () => ({ usePlayerStore: () => mockStore }));

import { usePlayerProgress } from "../usePlayerProgress";

let frames: FrameRequestCallback[] = [];
const runFrame = () => {
  const queued = frames;
  frames = [];
  for (const cb of queued) cb(performance.now());
};

const Bar = defineComponent({
  setup() {
    const { displayProgress, onScrubStart, onScrub, onScrubEnd } = usePlayerProgress();
    return { displayProgress, onScrubStart, onScrub, onScrubEnd };
  },
  render() {
    return h("div", String(this.displayProgress));
  },
});

type BarVm = { onScrubStart: () => void; onScrub: (value: number) => void; onScrubEnd: () => void };

describe("usePlayerProgress", () => {
  beforeEach(() => {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mockPlayer.currentTime = 0;
    mockStore.isPlaying = false;
    mockStore.status = "paused";
    mockStore.seekPercent.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs one animation loop for any number of bars", async () => {
    mockStore.isPlaying = true;
    mockStore.status = "playing";
    const first = mount(Bar);
    const second = mount(Bar);

    expect(frames).toHaveLength(1);
    mockPlayer.currentTime = 50;
    runFrame();
    await nextTick();

    expect(frames).toHaveLength(1);
    expect(first.text()).toBe("25");
    expect(second.text()).toBe("25");

    first.unmount();
    second.unmount();
  });

  it("stops the loop with the last bar and starts fresh for the next one", async () => {
    mockStore.isPlaying = true;
    mockStore.status = "playing";
    const bar = mount(Bar);
    expect(frames).toHaveLength(1);
    bar.unmount();

    expect(cancelAnimationFrame).toHaveBeenCalled();
    frames = [];
    mockPlayer.currentTime = 100;
    const next = mount(Bar);
    await nextTick();

    expect(frames).toHaveLength(1);
    expect(next.text()).toBe("50");
    next.unmount();
  });

  it("holds the scrub target after release and seeks the player", async () => {
    mockStore.isPlaying = true;
    mockStore.status = "playing";
    const bar = mount(Bar);
    const vm = bar.vm as unknown as BarVm;

    vm.onScrubStart();
    vm.onScrub(80);
    await nextTick();
    expect(bar.text()).toBe("80");

    vm.onScrubEnd();
    await nextTick();
    expect(mockStore.seekPercent).toHaveBeenCalledWith(80);
    expect(bar.text()).toBe("80");
    bar.unmount();
  });
});
