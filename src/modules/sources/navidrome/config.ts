import { platformCaps } from "@/lib/environment/platformCaps";
import { useSettingsStore } from "@/modules/settings/store";
import { buildNdConfig } from "@/modules/settings/schema";
import type { NdConfig } from "./api/subsonic";

/**
 * Resolves the active Navidrome config from the persisted settings, or null
 * when the source is unavailable (web build, disabled, incomplete, or the
 * Pinia context is not up yet).
 */
export function getNdConfig(): NdConfig | null {
  // ND requests and streams go through the Rust proxy layer.
  if (!platformCaps.canProxyStream) return null;
  try {
    return buildNdConfig(useSettingsStore().sources.nd);
  }
  catch {
    return null;
  }
}
