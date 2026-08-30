import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSettingsStore } from "../index";

describe("settings export", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("never carries credentials out of the app", () => {
    const store = useSettingsStore();
    store.updateNdSource({ enabled: true, baseUrl: "https://nd.example", username: "egor", password: "nd-secret" });
    store.updateProxy({ enabled: true, host: "127.0.0.1", username: "puser", password: "proxy-secret" });

    const json = store.exportToJSON();

    expect(json).not.toContain("nd-secret");
    expect(json).not.toContain("proxy-secret");
  });

  it("keeps every non-secret field so the export stays useful", () => {
    const store = useSettingsStore();
    store.updateNdSource({ enabled: true, baseUrl: "https://nd.example", username: "egor", password: "nd-secret" });
    store.updateProxy({ enabled: true, host: "127.0.0.1", port: 1080, protocol: "socks5", password: "proxy-secret" });

    const exported = JSON.parse(store.exportToJSON());

    expect(exported.sources.nd).toMatchObject({ enabled: true, baseUrl: "https://nd.example", username: "egor" });
    expect(exported.proxy).toMatchObject({ enabled: true, host: "127.0.0.1", port: 1080, protocol: "socks5" });
  });

  it("round-trips through importFromJSON with the secrets blank", () => {
    const store = useSettingsStore();
    store.updateNdSource({ enabled: true, baseUrl: "https://nd.example", username: "egor", password: "nd-secret" });
    const json = store.exportToJSON();

    store.reset();
    const result = store.importFromJSON(json);

    expect(result.isOk()).toBe(true);
    expect(store.settings.sources.nd.baseUrl).toBe("https://nd.example");
    expect(store.settings.sources.nd.password).toBe("");
  });

  it("leaves the live settings untouched", () => {
    const store = useSettingsStore();
    store.updateNdSource({ password: "nd-secret" });

    store.exportToJSON();

    expect(store.settings.sources.nd.password).toBe("nd-secret");
  });
});
