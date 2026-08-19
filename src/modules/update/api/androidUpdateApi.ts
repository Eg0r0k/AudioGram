import { ResultAsync } from "neverthrow";
import { fetch } from "@tauri-apps/plugin-http";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { UpdateError, UpdateInfo } from "../types";

/**
 * The Android take on check/install. There is no updater plugin on mobile, so
 * the manifest is read directly, and "install" opens the APK asset URL — the
 * browser downloads it and hands it to the system installer (the opener
 * plugin has no FileProvider path on Android, so an in-app download cannot
 * reach the installer directly).
 */

// Same order as the desktop updater endpoints in tauri.conf.json.
const MANIFEST_ENDPOINTS = [
  "https://raw.githubusercontent.com/Eg0r0k/Audiogram/main/docs/manifests/stable/latest.json",
  "https://eg0r0k.github.io/audiogram/manifests/stable/latest.json",
];

interface ManifestPlatform { url: string; signature: string }
interface Manifest {
  version: string;
  notes?: string;
  pub_date?: string;
  platforms: Record<string, ManifestPlatform | undefined>;
}

let stagedApkUrl: string | null = null;

const isNewer = (remote: string, current: string): boolean => {
  const a = remote.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
};

const fetchManifest = async (): Promise<Manifest> => {
  let lastError: unknown = null;
  for (const endpoint of MANIFEST_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, { method: "GET" });
      if (!response.ok) {
        lastError = new Error(`manifest fetch failed: ${response.status}`);
        continue;
      }
      return await response.json() as Manifest;
    }
    catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error("no manifest endpoints configured");
};

export const checkUpdateAndroid = (): ResultAsync<UpdateInfo | null, UpdateError> =>
  ResultAsync.fromPromise((async () => {
    const currentVersion = await getVersion();
    const manifest = await fetchManifest();

    const android = manifest.platforms["android-aarch64"];
    if (!android?.url || !isNewer(manifest.version, currentVersion)) {
      stagedApkUrl = null;
      return null;
    }

    stagedApkUrl = android.url;
    return {
      version: manifest.version,
      currentVersion,
      body: manifest.notes ?? null,
      date: manifest.pub_date ?? null,
    };
  })(), (e): UpdateError => ({ kind: "NETWORK", message: String(e) }));

export const installUpdateAndroid = (): ResultAsync<void, UpdateError> =>
  ResultAsync.fromPromise((async () => {
    if (!stagedApkUrl) throw new Error("no update staged — check first");
    await openUrl(stagedApkUrl);
  })(), (e): UpdateError => ({ kind: "INSTALL_FAILED", message: String(e) }));
