import type { ComputedRef, InjectionKey } from "vue";

/** Width (px) of the icon-only compact sidebar. */
export const SIDEBAR_COMPACT_WIDTH = 80;
/** Minimum width (px) of the expanded sidebar. */
export const SIDEBAR_EXPANDED_MIN_WIDTH = 280;
/** Maximum width (px) of the expanded sidebar. */
export const SIDEBAR_MAX_WIDTH = 400;
/**
 * While dragging, a width below this snaps to the compact layout; at or above
 * it the sidebar clamps back into the expanded [min, max] range.
 */
export const SIDEBAR_SNAP_THRESHOLD = 200;

/**
 * Provided by ResizableSidebar so the library sidebar and its children switch
 * to the icon-only layout. Absent (defaults to false) when the sidebar is
 * rendered full-size, e.g. the mobile IndexPage.
 */
export const SIDEBAR_COMPACT_KEY: InjectionKey<ComputedRef<boolean>>
  = Symbol("sidebar-compact");
