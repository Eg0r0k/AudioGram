import { watch } from "vue";
import { useLocalStorage } from "@vueuse/core";

export const ZOOM_LEVELS = [75, 90, 100, 110, 125, 150] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

const DEFAULT_ZOOM: ZoomLevel = 100;

const zoom = useLocalStorage<ZoomLevel>("zoom-level", DEFAULT_ZOOM);

function applyZoom(level: ZoomLevel) {
  document.documentElement.style.zoom = `${level}%`;
}

let initialized = false;

export function useZoom() {
  if (!initialized) {
    applyZoom(zoom.value);
    initialized = true;
  }

  watch(zoom, (newZoom) => {
    applyZoom(newZoom);
  });

  function setZoom(level: ZoomLevel) {
    zoom.value = level;
  }

  function resetZoom() {
    zoom.value = DEFAULT_ZOOM;
  }

  return {
    zoom,
    setZoom,
    resetZoom,
    zoomLevels: ZOOM_LEVELS,
  };
}
