import { watch } from "vue";
import { watchDebounced } from "@vueuse/core";
import { useNdSourceSettings } from "../store/sources";
import { applyNdConfig } from "../services/nd";
import { queryClient } from "@/queries/client";
import { invalidateSource } from "@/queries/source.queries";
import { checkSource } from "@/modules/sources/composables/useSourceHealth";

/** Credentials are typed a character at a time — see useProxySync. */
const INVALIDATE_DEBOUNCE_MS = 400;

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

  // A new server, a new account or a disabled source: what is cached was
  // answered by the previous one, and so was its health verdict. The probe
  // is what turns a half-typed password into "rejected" instead of a page of
  // empty lists. Not `immediate` — nothing is cached yet on launch.
  watchDebounced(
    ndConfig,
    () => {
      invalidateSource(queryClient, "nd");
      checkSource("nd");
    },
    { debounce: INVALIDATE_DEBOUNCE_MS },
  );
};
