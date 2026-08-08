import { describe, expect, it } from "vitest";
import { parse } from "valibot";
import { buildProxyUrl, DEFAULT_PROXY_SETTINGS, ProxySettingsSchema, type ProxySettings } from "../proxy";

const make = (partial: Partial<ProxySettings>): ProxySettings =>
  parse(ProxySettingsSchema, { ...DEFAULT_PROXY_SETTINGS, ...partial });

describe("buildProxyUrl", () => {
  it("returns null when the proxy is disabled", () => {
    expect(buildProxyUrl(make({ enabled: false, host: "127.0.0.1" }))).toBeNull();
  });

  it("returns null when enabled without a host", () => {
    expect(buildProxyUrl(make({ enabled: true, host: "   " }))).toBeNull();
  });

  it("builds a scheme://host:port URL without credentials", () => {
    const url = buildProxyUrl(make({ enabled: true, protocol: "socks5", host: "10.0.0.1", port: 1080 }));
    expect(url).toBe("socks5://10.0.0.1:1080");
  });

  it("embeds and percent-encodes credentials", () => {
    const url = buildProxyUrl(make({
      enabled: true,
      protocol: "http",
      host: "proxy.local",
      port: 8080,
      username: "user@name",
      password: "p:ss@word",
    }));
    expect(url).toBe("http://user%40name:p%3Ass%40word@proxy.local:8080");
  });

  it("trims surrounding whitespace from the host", () => {
    expect(buildProxyUrl(make({ enabled: true, host: "  host  ", port: 3128 })))
      .toBe("http://host:3128");
  });
});

describe("ProxySettingsSchema", () => {
  it("defaults to a disabled http proxy", () => {
    expect(DEFAULT_PROXY_SETTINGS).toEqual({
      enabled: false,
      protocol: "http",
      host: "",
      port: 8080,
      username: "",
      password: "",
    });
  });
});
