import { watch } from "vue";
import { useLocalStorage } from "@vueuse/core";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { getLogger } from "@/lib/logger";

export const ZOOM_LEVELS = [75, 90, 100, 110, 125, 150] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

const DEFAULT_ZOOM: ZoomLevel = 100;

const zoom = useLocalStorage<ZoomLevel>("zoom-level", DEFAULT_ZOOM);

/**
 * Tauri: native webview zoom (WebView2 ZoomFactor / WebKit page zoom) — the
 * same mechanism as Ctrl+± in a browser, so fixed positioning, viewport
 * units and DOM measurements all stay consistent. CSS `zoom` re-lays-out
 * the page with scaled metrics and breaks poppers and virtual lists.
 * Web build: script cannot drive the browser's native zoom, CSS zoom is the
 * only fallback there.
 */
async function applyZoom(level: ZoomLevel): Promise<void> {
  if (IS_TAURI) {
    try {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      await getCurrentWebview().setZoom(level / 100);
    }
    catch (err) {
      getLogger().error(`[Zoom] failed to set webview zoom: ${String(err)}`);
    }
    return;
  }

  document.documentElement.style.zoom = `${level}%`;
}

// Single module-level watcher: useZoom() is called from several settings
// pages, per-call watchers would re-apply the zoom once per caller.
watch(zoom, applyZoom);

let initialized = false;

/** Applies the persisted zoom once at startup; called from main.ts. */
export function initZoom(): void {
  if (initialized) return;
  initialized = true;
  // applyZoom catches and logs a failing webview call itself; startup must not
  // wait on it, so there is nothing left for this caller to report.
  applyZoom(zoom.value).catch(() => {});
}

export function useZoom() {
  initZoom();

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
