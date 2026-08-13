import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const configState = vi.hoisted(() => ({ current: null as object | null }));

vi.mock("../../navidrome/config", () => ({ getNdConfig: () => configState.current }));

import { useCurrentSourceStore } from "../currentSource.store";

describe("currentSource store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    configState.current = null;
  });

  it("defaults to local and only offers local while ND is unconfigured", () => {
    const store = useCurrentSourceStore();

    expect(store.currentSource).toBe("local");
    expect(store.availableSources).toEqual(["local"]);
  });

  it("offers and switches to nd when the source is configured", () => {
    configState.current = {};
    const store = useCurrentSourceStore();

    expect(store.availableSources).toEqual(["local", "nd"]);
    store.setSource("nd");
    expect(store.currentSource).toBe("nd");
  });

  it("falls back to local when the selected ND source vanishes", () => {
    configState.current = {};
    const store = useCurrentSourceStore();
    store.setSource("nd");

    configState.current = null;

    expect(store.currentSource).toBe("local");
    // The selection is kept, so re-enabling ND restores it.
    configState.current = {};
    expect(store.currentSource).toBe("nd");
  });
});
