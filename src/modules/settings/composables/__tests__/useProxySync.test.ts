import { effectScope, nextTick, type EffectScope } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const applyProxy = vi.hoisted(() => vi.fn());
vi.mock("../../services/proxy", () => ({ applyProxy }));

const checkAvailableSources = vi.hoisted(() => vi.fn(() => Promise.resolve([])));
vi.mock("@/modules/sources/composables/useSourceHealth", () => ({ checkAvailableSources }));

import { queryClient } from "@/queries/client";
import { useSettingsStore } from "../../store";
import { useProxySync } from "../useProxySync";

const PROXY = { enabled: true, host: "127.0.0.1", port: 1080 } as const;

describe("useProxySync", () => {
  let scope: EffectScope | null = null;
  let invalidate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    applyProxy.mockClear();
    invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
  });

  afterEach(() => {
    scope?.stop();
    scope = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const run = () => {
    scope = effectScope();
    scope.run(() => useProxySync());
  };

  it("applies the stored proxy on launch and drops nothing", async () => {
    useSettingsStore().updateProxy({ ...PROXY });

    run();

    expect(applyProxy).toHaveBeenCalledWith("http://127.0.0.1:1080");
    await vi.advanceTimersByTimeAsync(2000);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("drops every remote answer once a runtime change settles", async () => {
    run();
    expect(applyProxy).toHaveBeenCalledWith(null);

    useSettingsStore().updateProxy({ ...PROXY });
    await nextTick();

    expect(applyProxy).toHaveBeenLastCalledWith("http://127.0.0.1:1080");
    expect(invalidate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ["source"],
      ["youtube"],
    ]);
    // The old verdicts were about the old route out.
    expect(checkAvailableSources).toHaveBeenCalledTimes(1);
  });

  it("waits for the host to be typed out before refetching", async () => {
    run();
    const store = useSettingsStore();

    store.updateProxy({ enabled: true, host: "1", port: 1080 });
    await vi.advanceTimersByTimeAsync(100);
    store.updateProxy({ host: "127" });
    await vi.advanceTimersByTimeAsync(100);
    store.updateProxy({ host: "127.0.0.1" });
    await nextTick();

    // Every keystroke reached Rust; only the settled URL cost a refetch.
    expect(applyProxy).toHaveBeenCalledTimes(4);
    expect(invalidate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
