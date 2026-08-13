import { computed } from "vue";
import { useSettingsStore } from "../store";
import { buildProxyUrl, PROXY_PROTOCOLS, type ProxyProtocol, type ProxySettings } from "../schema";
import { IS_TAURI } from "@/lib/environment/userAgent";

export interface ProtocolOption {
  value: ProxyProtocol;
  label: string;
}

export const PROXY_PROTOCOL_OPTIONS: ProtocolOption[] = PROXY_PROTOCOLS.map(value => ({
  value,
  label: value.toUpperCase(),
}));

/**
 * Reactive accessors for the user-configured network proxy. The proxy is a
 * desktop-only feature: it is threaded into the Innertube client and the
 * `stream://` streaming client on the Rust side. `isSupported` mirrors
 * that so the UI can hide the section in the web build (where it is a no-op).
 */
export const useProxySettings = () => {
  const store = useSettingsStore();

  const proxy = computed(() => store.proxy);
  const enabled = computed(() => store.proxy.enabled);
  const protocol = computed(() => store.proxy.protocol);
  const host = computed(() => store.proxy.host);
  const port = computed(() => store.proxy.port);
  const username = computed(() => store.proxy.username);
  const password = computed(() => store.proxy.password);

  /** Full proxy URL, or `null` when disabled / lacking a host. */
  const proxyUrl = computed(() => buildProxyUrl(store.proxy));

  const setEnabled = (value: boolean) => store.updateProxy({ enabled: value });
  const setProtocol = (value: ProxyProtocol) => store.updateProxy({ protocol: value });
  const setHost = (value: string) => store.updateProxy({ host: value });
  const setPort = (value: number) => store.updateProxy({ port: value });
  const setUsername = (value: string) => store.updateProxy({ username: value });
  const setPassword = (value: string) => store.updateProxy({ password: value });

  const update = (partial: Partial<ProxySettings>) => store.updateProxy(partial);
  const reset = () => store.resetSection("proxy");

  return {
    proxy,
    enabled,
    protocol,
    host,
    port,
    username,
    password,
    proxyUrl,
    isSupported: IS_TAURI,
    protocolOptions: PROXY_PROTOCOL_OPTIONS,
    setEnabled,
    setProtocol,
    setHost,
    setPort,
    setUsername,
    setPassword,
    update,
    reset,
  };
};
