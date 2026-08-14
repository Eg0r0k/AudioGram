import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useRightPanelStore } from "../store/right-panel.store";

describe("right-panel.store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("opens queue with default global scope", () => {
    const store = useRightPanelStore();

    store.openQueue();

    expect(store.isOpen).toBe(true);
    expect(store.view).toBe("queue");
    expect(store.scope).toEqual({ type: "global" });
    expect(store.depth).toBe(0);
  });

  it("keeps route-scoped panel on same route", () => {
    const store = useRightPanelStore();

    store.openTrackInfo({ track: { id: "track-1" } as any }, {
      scope: { type: "route", routeKey: "/albums/1" },
      depth: 1,
    });

    store.invalidateRouteScope("/albums/1");

    expect(store.isOpen).toBe(true);
    expect(store.view).toBe("track-info");
  });

  it("returns to queue when opened from queue", () => {
    const store = useRightPanelStore();

    store.openQueue();
    store.openTrackInfo({ track: { id: "track-1" } as any }, { depth: 1 });

    store.back();

    expect(store.isOpen).toBe(true);
    expect(store.view).toBe("queue");
  });

  it("resets route-scoped panel when route changes", () => {
    const store = useRightPanelStore();

    store.openAddTracks({ entityType: "favorite", entityId: "favorites" }, {
      scope: { type: "route", routeKey: "/playlists/42" },
      depth: 2,
    });

    store.invalidateRouteScope("/albums/1");

    expect(store.isOpen).toBe(false);
    expect(store.view).toBe("none");
    expect(store.scope).toEqual({ type: "global" });
    expect(store.depth).toBe(0);
  });

  it("opens the downloads queue panel", () => {
    const store = useRightPanelStore();

    store.openDownloads();

    expect(store.isOpen).toBe(true);
    expect(store.view).toBe("downloads");
    expect(store.scope).toEqual({ type: "global" });
  });
});
