import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useUpdateScheduler } from "../composables/useUpdateScheduler";

const mockCheck = vi.hoisted(() => vi.fn());

vi.mock("../store/update.store", () => ({
  useUpdateStore: () => ({ check: mockCheck }),
}));

const STARTUP_DELAY_MS = 5000;
const INTERVAL_MS = 4 * 60 * 60 * 1000;

/** Mounts a host component so the composable gets a real lifecycle scope. */
function mountScheduler(enabled: unknown) {
  const Host = defineComponent({
    setup() {
      const api = useUpdateScheduler({ enabled: enabled as boolean });
      return { api };
    },
    render: () => h("div"),
  });

  return mount(Host);
}

describe("useUpdateScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCheck.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks shortly after start when enabled", async () => {
    mountScheduler(true);

    expect(mockCheck).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS);

    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it("keeps checking on the interval", async () => {
    mountScheduler(true);

    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS + INTERVAL_MS * 2);

    expect(mockCheck).toHaveBeenCalledTimes(3);
  });

  it("never checks while disabled", async () => {
    mountScheduler(false);

    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS + INTERVAL_MS * 2);

    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("starts checking when the setting is switched on at runtime", async () => {
    const enabled = ref(false);
    mountScheduler(enabled);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(mockCheck).not.toHaveBeenCalled();

    enabled.value = true;
    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS);

    expect(mockCheck, "toggling the setting must not need a restart").toHaveBeenCalledTimes(1);
  });

  it("stops checking when the setting is switched off at runtime", async () => {
    const enabled = ref(true);
    mountScheduler(enabled);

    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS);
    expect(mockCheck).toHaveBeenCalledTimes(1);

    enabled.value = false;
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it("stops its timers when the host unmounts", async () => {
    const wrapper = mountScheduler(true);

    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(STARTUP_DELAY_MS + INTERVAL_MS * 2);

    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("exposes a manual check that ignores the setting", () => {
    const wrapper = mountScheduler(false);

    wrapper.vm.api.checkNow();

    expect(mockCheck).toHaveBeenCalledTimes(1);
  });
});
