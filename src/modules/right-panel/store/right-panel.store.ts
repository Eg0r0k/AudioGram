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
        openQueue({ scope: scope.value, depth: 0 });
        return;
      case CURRENT_TRACK_VIEW:
      case "none":
      default:
        close();
    }
  }

  function invalidateRouteScope(routeKey: string): void {
    if (scope.value.type !== "route") return;
    if (scope.value.routeKey === routeKey) return;
    close();
  }

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
    back,
    close,
    invalidateRouteScope,
  };
});
