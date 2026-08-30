import { effectScope, nextTick, type EffectScope } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const applyNdConfig = vi.hoisted(() => vi.fn());
vi.mock("../../services/nd", () => ({ applyNdConfig }));

const checkSource = vi.hoisted(() => vi.fn(() => Promise.resolve({ state: "ok" })));
vi.mock("@/modules/sources/composables/useSourceHealth", () => ({ checkSource }));

import { queryClient } from "@/queries/client";
import { useSettingsStore } from "../../store";
import { useNdSourceSync } from "../useNdSourceSync";

const ND = {
  enabled: true,
  baseUrl: "https://music.example.com",
  username: "demo",
  password: "secret",
} as const;

describe("useNdSourceSync", () => {
  let scope: EffectScope | null = null;
  let invalidate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    applyNdConfig.mockClear();
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
    scope.run(() => useNdSourceSync());
  };

  it("applies the stored config on launch and drops nothing", async () => {
    useSettingsStore().updateNdSource({ ...ND });

    run();

    expect(applyNdConfig).toHaveBeenCalledWith({
      baseUrl: ND.baseUrl,
      username: ND.username,
      password: ND.password,
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("drops what the previous server answered once the change settles", async () => {
    run();
    expect(applyNdConfig).toHaveBeenCalledWith(null);

    useSettingsStore().updateNdSource({ ...ND });
    await nextTick();
    expect(invalidate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ["source", "nd"],
    ]);
    expect(checkSource).toHaveBeenCalledWith("nd");
  });
});
