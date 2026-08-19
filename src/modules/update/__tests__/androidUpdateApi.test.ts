import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getVersion: vi.fn(),
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: mocks.fetch }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }));

import { checkUpdateAndroid, installUpdateAndroid } from "../api/androidUpdateApi";

const manifest = (version: string, apkUrl: string | null) => ({
  ok: true,
  status: 200,
  json: async () => ({
    version,
    notes: "notes",
    pub_date: "2026-09-01T00:00:00Z",
    platforms: apkUrl ? { "android-aarch64": { url: apkUrl, signature: "" } } : {},
  }),
});

describe("checkUpdateAndroid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVersion.mockResolvedValue("0.2.2");
  });

  it("reports an update when the manifest version is newer", async () => {
    mocks.fetch.mockResolvedValue(manifest("0.2.10", "https://example/app.apk"));

    const result = await checkUpdateAndroid();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      version: "0.2.10",
      currentVersion: "0.2.2",
      body: "notes",
    });
  });

  it("returns null when already up to date", async () => {
    mocks.fetch.mockResolvedValue(manifest("0.2.2", "https://example/app.apk"));

    const result = await checkUpdateAndroid();

    expect(result._unsafeUnwrap()).toBeNull();
  });

  it("returns null when the manifest has no android entry", async () => {
    mocks.fetch.mockResolvedValue(manifest("0.9.9", null));

    const result = await checkUpdateAndroid();

    expect(result._unsafeUnwrap()).toBeNull();
  });

  it("falls back to the second endpoint when the first fails", async () => {
    mocks.fetch
      .mockRejectedValueOnce(new Error("blocked"))
      .mockResolvedValueOnce(manifest("0.3.0", "https://example/app.apk"));

    const result = await checkUpdateAndroid();

    expect(result._unsafeUnwrap()).toMatchObject({ version: "0.3.0" });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("errors with NETWORK when every endpoint fails", async () => {
    mocks.fetch.mockRejectedValue(new Error("blocked"));

    const result = await checkUpdateAndroid();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().kind).toBe("NETWORK");
  });
});

describe("installUpdateAndroid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVersion.mockResolvedValue("0.2.2");
  });

  it("opens the staged apk url so the browser hands it to the installer", async () => {
    mocks.fetch.mockResolvedValue(manifest("0.3.0", "https://example/app.apk"));
    mocks.openUrl.mockResolvedValue(undefined);
    await checkUpdateAndroid();

    const result = await installUpdateAndroid();

    expect(result.isOk()).toBe(true);
    expect(mocks.openUrl).toHaveBeenCalledWith("https://example/app.apk");
  });

  it("fails with INSTALL_FAILED when nothing is staged", async () => {
    mocks.fetch.mockResolvedValue(manifest("0.2.2", "https://example/app.apk"));
    await checkUpdateAndroid();

    const result = await installUpdateAndroid();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().kind).toBe("INSTALL_FAILED");
    expect(mocks.openUrl).not.toHaveBeenCalled();
  });
});
