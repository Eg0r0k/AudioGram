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

  it("opens folder-add at depth 1 with the folder scope by default", () => {
    const store = useRightPanelStore();

    store.openFolderAdd({ folderId: "f1" });

    expect(store.isOpen).toBe(true);
    expect(store.view).toBe("folder-add");
    expect(store.payload).toEqual({ folderId: "f1" });
    expect(store.depth).toBe(1);
    expect(store.scope).toEqual({ type: "folder", folderId: "f1" });
  });

  it("keeps a folder-scoped panel while the same folder stays active", () => {
    const store = useRightPanelStore();

    store.openFolderAdd({ folderId: "f1" });
    store.invalidateFolderScope("f1");

    expect(store.isOpen).toBe(true);
    expect(store.view).toBe("folder-add");
  });

  it("closes a folder-scoped panel when another folder becomes active or none is", () => {
    const store = useRightPanelStore();

    store.openFolderAdd({ folderId: "f1" });
    store.invalidateFolderScope("f2");
    expect(store.isOpen).toBe(false);
    expect(store.view).toBe("none");
    expect(store.scope).toEqual({ type: "global" });

    store.openFolderAdd({ folderId: "f1" });
    store.invalidateFolderScope(null);
    expect(store.isOpen).toBe(false);
  });

  it("invalidateFolderScope leaves route- and global-scoped panels alone", () => {
    const store = useRightPanelStore();

    store.openQueue();
    store.invalidateFolderScope(null);
    expect(store.isOpen).toBe(true);
    expect(store.view).toBe("queue");

    store.openAddTracks({ entityType: "favorite", entityId: "favorites" }, {
      scope: { type: "route", routeKey: "/playlists/42" },
    });
    store.invalidateFolderScope("f1");
    expect(store.isOpen).toBe(true);
    expect(store.view).toBe("add-tracks");
  });

  it("route changes do not close a folder-scoped panel", () => {
    const store = useRightPanelStore();

    store.openFolderAdd({ folderId: "f1" });
    store.invalidateRouteScope("/albums/1");

    expect(store.isOpen).toBe(true);
    expect(store.view).toBe("folder-add");
  });

  it("back from a folder-scoped panel to the queue drops the folder scope", () => {
    const store = useRightPanelStore();
    store.openQueue();
    store.openFolderAdd({ folderId: "f1" });
    store.back();
    expect(store.view).toBe("queue");
    expect(store.scope).toEqual({ type: "global" });
    store.invalidateFolderScope(null);
    expect(store.isOpen).toBe(true);
    expect(store.view).toBe("queue");
  });
});
