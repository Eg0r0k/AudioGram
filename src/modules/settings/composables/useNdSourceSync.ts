import { watch } from "vue";
import { useNdSourceSettings } from "../store/sources";
import { applyNdConfig } from "../services/nd";

/**
 * Keeps the Rust-side Navidrome config in sync with the persisted source
 * settings. Runs once immediately (applying the stored config on launch) and
 * on every later change. Desktop-only — call from App setup behind `IS_TAURI`.
 */
export const useNdSourceSync = () => {
  const { ndConfig } = useNdSourceSettings();

  watch(
    ndConfig,
    (config) => {
      applyNdConfig(config);
    },
    { immediate: true },
  );
};
