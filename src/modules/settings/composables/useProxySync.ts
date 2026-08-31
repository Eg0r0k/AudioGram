import { watch } from "vue";
import { watchDebounced } from "@vueuse/core";
import { useProxySettings } from "../store/proxy";
import { applyProxy } from "../services/proxy";
import { getLogger } from "@/lib/logger";
import { queryClient } from "@/queries/client";
import { invalidateRemoteSources } from "@/queries/source.queries";
import { checkAvailableSources } from "@/modules/sources/composables/useSourceHealth";

/**
 * The settings page writes on every keystroke, so a typed host arrives one
 * character at a time. Handing each of those to Rust is cheap; refetching
 * every remote query for each is not — the cache is dropped once the URL
 * settles instead.
 */
const INVALIDATE_DEBOUNCE_MS = 400;

/**
 * Keeps the Rust-side proxy state in sync with the persisted proxy settings.
 * Runs once immediately (applying the stored proxy on launch) and on every
 * later change. Desktop-only — call from App setup behind `IS_TAURI`.
 */
export const useProxySync = () => {
  const { proxyUrl } = useProxySettings();

  watch(
    proxyUrl,
    (url) => {
      applyProxy(url);
    },
    { immediate: true },
  );

  // Everything already cached from a remote source travelled the old route,
  // failures included — see invalidateRemoteSources. The health verdicts were
  // about that route too, so they are re-earned rather than kept. Deliberately
  // not `immediate`: on launch there is nothing cached to drop.
  watchDebounced(
    proxyUrl,
    () => {
      invalidateRemoteSources(queryClient)
        .catch(error => getLogger().error(`[Settings] Dropping the cached remote data failed: ${String(error)}`));
      checkAvailableSources()
        .catch(error => getLogger().error(`[Settings] Re-probing the configured sources failed: ${String(error)}`));
    },
    { debounce: INVALIDATE_DEBOUNCE_MS },
  );
};
