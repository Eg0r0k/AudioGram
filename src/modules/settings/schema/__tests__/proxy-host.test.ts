import { describe, expect, it } from "vitest";
import { buildProxyUrl, DEFAULT_PROXY_SETTINGS, isValidProxyHost } from "../proxy";

describe("isValidProxyHost", () => {
  it("accepts host names, IPv4 and bracketed IPv6", () => {
    expect(isValidProxyHost("127.0.0.1")).toBe(true);
    expect(isValidProxyHost("proxy.example.com")).toBe(true);
    expect(isValidProxyHost(" localhost ")).toBe(true);
    expect(isValidProxyHost("[::1]")).toBe(true);
  });

  it("rejects a scheme, path, port, credentials and whitespace inside", () => {
    expect(isValidProxyHost("http://127.0.0.1")).toBe(false);
    expect(isValidProxyHost("127.0.0.1:1080")).toBe(false);
    expect(isValidProxyHost("proxy.example/path")).toBe(false);
    expect(isValidProxyHost("user@proxy.example")).toBe(false);
    expect(isValidProxyHost("proxy example")).toBe(false);
    expect(isValidProxyHost("")).toBe(false);
  });
});

describe("buildProxyUrl with an invalid host", () => {
  it("yields null instead of a URL the backend would reject on every request", () => {
    const settings = { ...DEFAULT_PROXY_SETTINGS, enabled: true, host: "http://127.0.0.1", port: 1080 };

    expect(buildProxyUrl(settings)).toBeNull();
  });
});
