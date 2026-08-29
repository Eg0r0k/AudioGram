import { defineStore } from "pinia";
import { ref } from "vue";
import { useDeviceLayout } from "@/composables/useDeviceLayout";
import type {
  OpenRightPanelOptions,
  RightPanelBackView,
  RightPanelPayloadMap,
  RightPanelScope,
  RightPanelView,
} from "../types";

const GLOBAL_SCOPE: RightPanelScope = { type: "global" };
const CURRENT_TRACK_VIEW: RightPanelBackView = "current-track";

export const useRightPanelStore = defineStore("right-panel", () => {
  const { isMobileLayout } = useDeviceLayout();
  const isOpen = ref(false);
  const view = ref<RightPanelView>("none");
  const scope = ref<RightPanelScope>(GLOBAL_SCOPE);
  const payload = ref<unknown>(undefined);
  const depth = ref(0);
  const returnToView = ref<RightPanelBackView>("none");

  function resolveReturnToView(explicitValue?: RightPanelBackView): RightPanelBackView {
    if (explicitValue) return explicitValue;

    if (isOpen.value) {
      if (view.value === "queue") return "queue";
      if (view.value === CURRENT_TRACK_VIEW) return CURRENT_TRACK_VIEW;
    }

    return isMobileLayout.value ? "none" : CURRENT_TRACK_VIEW;
  }

  function open<V extends Exclude<RightPanelView, "none">>(
    nextView: V,
    nextPayload?: RightPanelPayloadMap[V],
    options: OpenRightPanelOptions = {},
  ): void {
    const queueReturnToView: RightPanelBackView = isMobileLayout.value ? "none" : CURRENT_TRACK_VIEW;
    const nextReturnToView = nextView === "queue"
      ? queueReturnToView
      : resolveReturnToView(options.returnToView);

    isOpen.value = true;
    view.value = nextView;
    payload.value = nextPayload;
    scope.value = options.scope ?? GLOBAL_SCOPE;
    depth.value = options.depth ?? 0;
    returnToView.value = nextReturnToView;
  }
  function openQueue(options: OpenRightPanelOptions = {}): void {
    open("queue", undefined, { ...options, depth: options.depth ?? 0 });
  }

  function openTrackInfo(
    nextPayload: RightPanelPayloadMap["track-info"],
    options: OpenRightPanelOptions = {},
  ): void {
    open("track-info", nextPayload, { ...options, depth: options.depth ?? 1 });
  }

  function openEditTrack(
    nextPayload: RightPanelPayloadMap["edit-track"],
    options: OpenRightPanelOptions = {},
  ): void {
    open("edit-track", nextPayload, { ...options, depth: options.depth ?? 2 });
  }

  function openLyrics(options: OpenRightPanelOptions = {}): void {
    open("lyrics", undefined, { ...options, depth: options.depth ?? 1 });
  }

  function openAddTracks(
    nextPayload: RightPanelPayloadMap["add-tracks"],
    options: OpenRightPanelOptions = {},
  ): void {
    open("add-tracks", nextPayload, { ...options, depth: options.depth ?? 1 });
  }

  function openDownloads(options: OpenRightPanelOptions = {}): void {
    open("downloads", undefined, { ...options, depth: options.depth ?? 0 });
  }

  const openEntitySelect = (
    nextPayload: RightPanelPayloadMap["entity-select"],
    options: OpenRightPanelOptions = {},
  ): void => {
    open("entity-select", nextPayload, { ...options, depth: options.depth ?? 3 });
  };

  /**
   * Folder picker. Scoped to its folder by default so the sidebar can close
   * it through `invalidateFolderScope` when the user leaves that folder.
   */
  const openFolderAdd = (
    nextPayload: RightPanelPayloadMap["folder-add"],
    options: OpenRightPanelOptions = {},
  ): void => {
    open("folder-add", nextPayload, {
      ...options,
      depth: options.depth ?? 1,
      scope: options.scope ?? { type: "folder", folderId: nextPayload.folderId },
    });
  };

  function openChapters(
    nextPayload: RightPanelPayloadMap["chapters"],
    options: OpenRightPanelOptions = {},
  ): void {
    open("chapters", nextPayload, { ...options, depth: options.depth ?? 1 });
  }

  function close(): void {
    isOpen.value = false;
    view.value = "none";
    scope.value = GLOBAL_SCOPE;
    payload.value = undefined;
    depth.value = 0;
    returnToView.value = "none";
  }

  function back(): void {
    switch (returnToView.value) {
      case "queue":
        openQueue({ scope: scope.value.type === "folder" ? { type: "global" } : scope.value, depth: 0 });
        return;
      case CURRENT_TRACK_VIEW:
      case "none":
      default:
        close();
    }
  }

  const uiBackDelegate = ref<(() => void) | null>(null);

  const setUiBackDelegate = (delegate: () => void): void => {
    uiBackDelegate.value = delegate;
  };

  const clearUiBackDelegate = (delegate: () => void): void => {
    if (uiBackDelegate.value === delegate) uiBackDelegate.value = null;
  };

  /** One step of the real back chain: the active panel's UI back if it has its own, the returnToView chain otherwise. */
  const stepBack = (): void => {
    const delegate = uiBackDelegate.value;
    if (delegate) {
      delegate();
      return;
    }
    back();
  };

  function invalidateRouteScope(routeKey: string): void {
    if (scope.value.type !== "route") return;
    if (scope.value.routeKey === routeKey) return;
    close();
  }

  /** Mirror of `invalidateRouteScope`: `null` means «no folder is open». */
  const invalidateFolderScope = (activeFolderId: string | null): void => {
    if (scope.value.type !== "folder") return;
    if (scope.value.folderId === activeFolderId) return;
    close();
  };

  return {
    isOpen,
    view,
    scope,
    payload,
    depth,
    returnToView,
    open,
    openQueue,
    openLyrics,
    openTrackInfo,
    openEditTrack,
    openAddTracks,
    openChapters,
    openDownloads,
    openEntitySelect,
    openFolderAdd,
    back,
    stepBack,
    setUiBackDelegate,
    clearUiBackDelegate,
    close,
    invalidateRouteScope,
    invalidateFolderScope,
  };
});
