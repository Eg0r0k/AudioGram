import type { ComputedRef, InjectionKey } from "vue";

// Width constants live with the sidebar state owner in @/composables/useSidebar.
export {
  SIDEBAR_COMPACT_WIDTH,
  SIDEBAR_EXPANDED_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_SNAP_THRESHOLD,
} from "@/composables/useSidebar";

/**
 * Provided by ResizableSidebar so the library sidebar and its children switch
 * to the icon-only layout. Absent (defaults to false) when the sidebar is
 * rendered full-size, e.g. the mobile IndexPage.
 */
export const SIDEBAR_COMPACT_KEY: InjectionKey<ComputedRef<boolean>>
  = Symbol("sidebar-compact");
