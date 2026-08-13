import { computed } from "vue";
import { useSettingsStore } from "../store";
import { buildNdConfig, type NdSourceSettings } from "../schema";
import { IS_TAURI } from "@/lib/environment/userAgent";

/**
 * Reactive accessors for the Navidrome source settings. Like the proxy, the
 * source is Tauri-only: the Subsonic client and the `stream://` proxy run on
 * the Rust side, so `isSupported` lets the web build hide the section.
 */
export const useNdSourceSettings = () => {
  const store = useSettingsStore();

  const nd = computed(() => store.sources.nd);
  const enabled = computed(() => store.sources.nd.enabled);
  const baseUrl = computed(() => store.sources.nd.baseUrl);
  const username = computed(() => store.sources.nd.username);
  const password = computed(() => store.sources.nd.password);

  /** Client/proxy config, or `null` when disabled or incomplete. */
  const ndConfig = computed(() => buildNdConfig(store.sources.nd));

  const setEnabled = (value: boolean) => store.updateNdSource({ enabled: value });
  const setBaseUrl = (value: string) => store.updateNdSource({ baseUrl: value });
  const setUsername = (value: string) => store.updateNdSource({ username: value });
  const setPassword = (value: string) => store.updateNdSource({ password: value });

  const update = (partial: Partial<NdSourceSettings>) => store.updateNdSource(partial);

  return {
    nd,
    enabled,
    baseUrl,
    username,
    password,
    ndConfig,
    isSupported: IS_TAURI,
    setEnabled,
    setBaseUrl,
    setUsername,
    setPassword,
    update,
  };
};
