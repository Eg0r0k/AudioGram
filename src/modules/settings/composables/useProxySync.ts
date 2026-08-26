import { watch } from "vue";
import { useProxySettings } from "../store/proxy";
import { applyProxy } from "../services/proxy";

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
};
