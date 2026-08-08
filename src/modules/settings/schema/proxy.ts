import { object, boolean, picklist, optional, string, number, pipe, integer, minValue, maxValue, parse } from "valibot";
import type { InferOutput } from "valibot";

/** Proxy schemes forwarded to the Rust side (Innertube client + streaming reqwest client).
 * reqwest supports http/https/socks5 (with the `socks` feature); we keep the list
 * to exactly what the backend honors so behavior never diverges. */
export const PROXY_PROTOCOLS = ["http", "https", "socks5"] as const;
export type ProxyProtocol = typeof PROXY_PROTOCOLS[number];

export const ProxySettingsSchema = object({
  enabled: optional(boolean(), false),
  protocol: optional(picklist(PROXY_PROTOCOLS), "http"),
  host: optional(string(), ""),
  port: optional(pipe(number(), integer(), minValue(1), maxValue(65535)), 8080),
  username: optional(string(), ""),
  password: optional(string(), ""),
});

export type ProxySettings = InferOutput<typeof ProxySettingsSchema>;

export const DEFAULT_PROXY_SETTINGS = parse(ProxySettingsSchema, {});

/**
 * Builds the proxy URL (`scheme://[user:pass@]host:port`) passed to the backend,
 * or `null` when the proxy is disabled or has no host. Credentials are
 * percent-encoded so `@`/`:` in a username or password don't corrupt the URL.
 */
export const buildProxyUrl = (settings: ProxySettings): string | null => {
  if (!settings.enabled) return null;

  const host = settings.host.trim();
  if (!host) return null;

  const auth = settings.username
    ? `${encodeURIComponent(settings.username)}:${encodeURIComponent(settings.password)}@`
    : "";

  return `${settings.protocol}://${auth}${host}:${settings.port}`;
};
