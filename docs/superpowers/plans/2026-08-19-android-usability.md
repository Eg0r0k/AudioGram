# Android Usability (v0.2.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Android build actually usable: imports work from the system picker, Navidrome streams, the Music folder auto-imports, the app self-updates via APK, and settings stop showing desktop-only toggles.

**Architecture:** Three fronts. (1) Frontend storage/import fixes for Android SAF `content://` URIs. (2) Rust: split the desktop-only gate so `nd` + `stream://` + proxy commands compile on mobile while youtube/yt-dlp stays desktop. (3) Platform plumbing: Android manifest permissions, a TS-side APK updater reusing the existing update store, and `platformCaps`-driven settings gating.

**Tech Stack:** Vue 3 + TS + Vitest, Tauri 2 (plugin-fs 2.5, plugin-dialog 2.7, plugin-http, plugin-opener), Rust (reqwest/rustls), GitHub Actions.

## Global Constraints

- Code style: arrow const functions only (`const fn = () => {}`), no `function fn()` in new TS code.
- No comments inside Vue `<template>` blocks.
- No Co-Authored-By/attribution lines in commits.
- Never log Navidrome auth material or upstream URLs (they embed tokens).
- `IS_MOBILE`/`platformCaps` gating: gate features on capabilities, not raw platform checks, except UI cosmetics.
- All user-facing strings go through vue-i18n (en + ru locales).
- Verification gates: `pnpm vue-tsc --noEmit`, `pnpm test run`, `pnpm lint`, `cargo check` in src-tauri.

## Key facts discovered during research (do not re-derive)

- Android file picker returns `content://` URIs. plugin-fs `open`/`readFile`/`writeFile` handle them (Kotlin FD bridge); `copyFile` does NOT (`std::fs::copy` on an unresolvable path) — this is the import failure.
- Import failure code proves read+parse already work on-device (STORAGE_FAILED, not READ_FAILED/PARSE_FAILED).
- `content://` URIs have no extension → `item.ext` is `""` → target `tracks/<uuid>.` is malformed.
- plugin-dialog Android has NO directory picker (TODO in Kotlin source); file multi-select works via `EXTRA_ALLOW_MULTIPLE` (long-press in picker).
- inotify does not work on Android FUSE storage → no live watching; scan-on-launch works with direct paths once `READ_MEDIA_AUDIO` is granted. Public music dir: `/storage/emulated/0/Music`.
- Rust: `mod nd`, `mod stream`, `mod youtube` are all `#[cfg(desktop)]` in `src-tauri/src/lib.rs:5-24`. Mobile `invoke_handler` is EMPTY (`lib.rs:139`), so even `app_data_folder_size` is missing on Android.
- `ProxyState` + `set_proxy` + `proxy_check` live in `src-tauri/src/youtube/mod.rs` (desktop-only) but are yt-agnostic except the `YtClient` reset inside `set_proxy`.
- `stream.rs` is source-generic; only the `yt/` route arm (`stream.rs:209-211`) touches the youtube module. nd routes do NOT currently pass a proxy to `forward_get` — wire `ProxyState` in while porting.
- Update store already has a pluggable-handler pattern (`registerPwaHandlers`); `updateApi.checkUpdate/installUpdate` invoke Rust `check_update`/`install_update` (desktop updater plugin). `UpdateInfo = {version, currentVersion, body, date}`.
- Android manifest already has a FileProvider configured; `REQUEST_INSTALL_PACKAGES` + opener should launch the system APK installer.
- publish-manifest job builds `latest.json` with jq from release assets (`.github/workflows/release.yml:222-315`); APK asset name: `Audiogram_<version>_aarch64.apk`.
- fs capability (`src-tauri/capabilities/default.json`) allows appdata read/write recursive; writing the downloaded APK under `$APPDATA/updates/` needs no capability change.

---

### Task 1: Stream-copy `content://` sources in TauriStorage.importFile

**Files:**
- Modify: `src/db/storage/tauri.storage.ts:63-73`
- Test: `src/db/storage/__tests__/tauri.storage.test.ts` (create if absent; existing tests in that dir show the plugin-fs mocking pattern)

**Interfaces:**
- Produces: `importFile(sourceAbsPath, targetRelPath)` keeps its signature; new private `copyStreaming(source: string, targetRelPath: string): Promise<void>`.

- [x] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fsMocks = vi.hoisted(() => ({
  copyFile: vi.fn().mockResolvedValue(undefined),
  open: vi.fn(),
  exists: vi.fn().mockResolvedValue(true),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  ...fsMocks,
  BaseDirectory: { AppData: 21 },
  writeFile: vi.fn(),
  remove: vi.fn(),
  readDir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}));
vi.mock("@tauri-apps/api/path", () => ({ appDataDir: vi.fn().mockResolvedValue("/data/app") }));
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => p }));

import { TauriStorage } from "../tauri.storage";

const makeHandle = (chunks: Uint8Array[]) => {
  let i = 0;
  return {
    read: vi.fn(async (buf: Uint8Array) => {
      if (i >= chunks.length) return 0;
      buf.set(chunks[i]);
      return chunks[i++].length;
    }),
    write: vi.fn(async (data: Uint8Array) => data.length),
    close: vi.fn().mockResolvedValue(undefined),
  };
};

describe("TauriStorage.importFile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("copies plain absolute paths with copyFile", async () => {
    const storage = new TauriStorage();
    const res = await storage.importFile("C:/music/a.mp3", "tracks/x.mp3");
    expect(res.isOk()).toBe(true);
    expect(fsMocks.copyFile).toHaveBeenCalled();
    expect(fsMocks.open).not.toHaveBeenCalled();
  });

  it("streams content:// sources through open() instead of copyFile", async () => {
    const src = makeHandle([new Uint8Array([1, 2, 3])]);
    const dest = makeHandle([]);
    fsMocks.open.mockResolvedValueOnce(src).mockResolvedValueOnce(dest);

    const storage = new TauriStorage();
    const res = await storage.importFile("content://media/audio/123", "tracks/x.mp3");

    expect(res.isOk()).toBe(true);
    expect(fsMocks.copyFile).not.toHaveBeenCalled();
    expect(dest.write).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(src.close).toHaveBeenCalled();
    expect(dest.close).toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run to verify failure** — `pnpm vitest run src/db/storage/__tests__/tauri.storage.test.ts` → the `content://` test fails (copyFile called / open never called).

- [x] **Step 3: Implement**

In `tauri.storage.ts`, replace `importFile` and add `copyStreaming`:

```ts
  importFile(sourceAbsPath: string, targetRelPath: string): ResultAsync<string, StorageError> {
    return fromPromise((async () => {
      const target = normalizePath(targetRelPath);
      await this.ensureDir(this.getFolder(target));

      // Android SAF sources (content://) cannot be std::fs-copied by the fs
      // plugin; stream them through open(), which resolves them to an FD.
      if (sourceAbsPath.startsWith("content://")) {
        await this.copyStreaming(sourceAbsPath, target);
        return target;
      }

      const appData = await this.getAppDataDir();
      await copyFile(sourceAbsPath, this.joinPath(appData, target));
      return target;
    })(), e => StorageError.writeFailed(targetRelPath, e));
  }

  private async copyStreaming(source: string, targetRelPath: string): Promise<void> {
    const src = await open(source, { read: true });
    try {
      const dest = await open(targetRelPath, {
        write: true,
        create: true,
        truncate: true,
        baseDir: this.baseDir,
      });
      try {
        const buffer = new Uint8Array(1024 * 1024);
        for (;;) {
          const read = await src.read(buffer);
          if (!read) break;
          let chunk = buffer.subarray(0, read);
          while (chunk.length > 0) {
            const written = await dest.write(chunk);
            chunk = chunk.subarray(written);
          }
        }
      }
      finally {
        await dest.close();
      }
    }
    finally {
      await src.close();
    }
  }
```

- [x] **Step 4: Run tests** — same command, expect PASS. Then `pnpm vue-tsc --noEmit`.

- [x] **Step 5: Commit** — `fix(android): stream content:// imports instead of fs copy`

---

### Task 2: Extension fallback for extension-less native imports

**Files:**
- Create: `src/lib/files/sniffAudioType.ts`
- Modify: `src/services/import/import-pipeline.ts:274-311` (storagePath built at `:280` before head bytes exist — move it after parse)
- Test: `src/lib/files/__tests__/sniffAudioType.test.ts`

**Interfaces:**
- Produces: `export const sniffAudioExtension = (head: Uint8Array): string | null` — returns `"mp3" | "flac" | "ogg" | "wav" | "m4a" | null`.

- [x] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { sniffAudioExtension } from "../sniffAudioType";

const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap(x => typeof x === "string" ? [...x].map(c => c.charCodeAt(0)) : [x]));

describe("sniffAudioExtension", () => {
  it("detects ID3-tagged and bare mpeg audio as mp3", () => {
    expect(sniffAudioExtension(bytes("ID3", 4, 0, 0))).toBe("mp3");
    expect(sniffAudioExtension(bytes(0xff, 0xfb, 0x90))).toBe("mp3");
  });
  it("detects flac, ogg and wav containers", () => {
    expect(sniffAudioExtension(bytes("fLaC"))).toBe("flac");
    expect(sniffAudioExtension(bytes("OggS"))).toBe("ogg");
    expect(sniffAudioExtension(bytes("RIFF", 0, 0, 0, 0, "WAVE"))).toBe("wav");
  });
  it("detects the mp4 ftyp box as m4a", () => {
    expect(sniffAudioExtension(bytes(0, 0, 0, 24, "ftypM4A "))).toBe("m4a");
  });
  it("returns null for unknown payloads", () => {
    expect(sniffAudioExtension(bytes("PK", 3, 4))).toBeNull();
    expect(sniffAudioExtension(new Uint8Array(0))).toBeNull();
  });
});
```

- [x] **Step 2: Run to verify failure.**

- [x] **Step 3: Implement `sniffAudioType.ts`**

```ts
const ascii = (head: Uint8Array, offset: number, text: string): boolean => {
  if (head.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (head[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
};

/**
 * Container sniffing for imports whose name carries no extension (Android
 * `content://` URIs). Head-of-file magic only — enough for the formats the
 * importer accepts.
 */
export const sniffAudioExtension = (head: Uint8Array): string | null => {
  if (ascii(head, 0, "ID3")) return "mp3";
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return "mp3";
  if (ascii(head, 0, "fLaC")) return "flac";
  if (ascii(head, 0, "OggS")) return "ogg";
  if (ascii(head, 0, "RIFF") && ascii(head, 8, "WAVE")) return "wav";
  if (ascii(head, 4, "ftyp")) return "m4a";
  return null;
};
```

- [x] **Step 4: Wire into the pipeline.** In `processItem` (import-pipeline.ts), the path is currently fixed before reading:

```ts
    const trackId = TrackId(crypto.randomUUID());
    const storagePath = `tracks/${trackId}.${item.ext}`;
```

Replace with a resolution inside the chain — the head bytes are available after `readHeadBytes`:

```ts
    const trackId = TrackId(crypto.randomUUID());
    let storagePath = "";

    return ResultAsync.fromPromise(
      this.deps.itemIO.readHeadBytes(item),
      (e): ImportError => e instanceof ImportError ? e : ImportError.readFailed(item.name, e),
    )
      .andThen((data) => {
        const ext = item.ext || sniffAudioExtension(data) || "mp3";
        storagePath = `tracks/${trackId}.${ext}`;
        return ResultAsync.fromPromise(
          this.deps.metadataParser.parse(item.name, data, item.file),
          (e): ImportError => e instanceof ImportError ? e : ImportError.parseFailed(item.name, e),
        );
      })
```

(the rest of the chain is unchanged — it already closes over `storagePath`).
Add import: `import { sniffAudioExtension } from "@/lib/files/sniffAudioType";`

- [x] **Step 5: Add a pipeline regression test** in `src/services/__tests__/import-pipeline.test.ts` next to the MIME-only test (`:223`): a native item with `ext: ""` and mp3 head bytes must store as `.mp3`, not `tracks/<uuid>.`:

```ts
    it("sniffs the storage extension for extension-less native items", async () => {
      const item = nativeItems("content://media/audio/42")[0];
      item.ext = "";
      fakes.readHeadBytes.mockResolvedValue(new Uint8Array([0x49, 0x44, 0x33, 4, 0]));

      await makePipeline(fakes).run([item]);

      expect(fakes.copyToStorage).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/\.mp3$/),
      );
    });
```

(Adapt helper names to the file's actual fakes — `nativeItems`/`fakes.readHeadBytes` exist per the STORAGE_FAILED test at `:513`.)

- [x] **Step 6: Run** `pnpm vitest run src/lib/files src/services` → PASS; `pnpm vue-tsc --noEmit`.

- [x] **Step 7: Commit** — `fix(import): sniff audio container when the source has no extension`

---

### Task 3: Rust — extract a shared proxy module

**Files:**
- Create: `src-tauri/src/proxy.rs`
- Modify: `src-tauri/src/youtube/mod.rs` (remove `ProxyState`, `set_proxy`, `proxy_check`; import from `crate::proxy`)
- Modify: `src-tauri/src/lib.rs` (unconditional `mod proxy;`, manage + register)
- Modify: `src-tauri/src/youtube/stream.rs:15` (import `ProxyState` from `crate::proxy`)

**Interfaces:**
- Produces: `crate::proxy::ProxyState` (same `get`/`set` API, `set` made `pub(crate)`), commands `proxy::set_proxy`, `proxy::proxy_check`.
- Consumes: `crate::youtube::YtClient::reset()` (desktop only).

- [x] **Step 1: Create `proxy.rs`** — move the `ProxyState` struct + impl, `set_proxy`, `proxy_check` verbatim from `youtube/mod.rs:42-135`, with two changes: `fn set`/`fn get` become `pub(crate)`, and the YtClient reset is desktop-gated:

```rust
//! User-configured network proxy shared by every Rust HTTP layer
//! (yt-dlp sidecar, rustypipe, the `stream://` proxy, nd routes).

use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime};

#[derive(Default)]
pub struct ProxyState(Mutex<Option<String>>);

impl ProxyState {
    pub(crate) fn set(&self, url: Option<String>) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = url;
        }
    }

    pub(crate) fn get(&self) -> Option<String> {
        self.0.lock().ok().and_then(|guard| guard.clone())
    }
}

/// Stores the proxy URL for later streaming use. An empty/blank URL clears it.
#[tauri::command]
pub async fn set_proxy<R: Runtime>(app: AppHandle<R>, url: Option<String>) {
    let normalized = url.map(|u| u.trim().to_owned()).filter(|u| !u.is_empty());
    app.state::<ProxyState>().set(normalized);
    // Drop the cached Innertube client so the next query picks up the new proxy.
    #[cfg(desktop)]
    app.state::<crate::youtube::YtClient>().reset().await;
}
```

`proxy_check` moves over unchanged. Keep `use` items minimal so mobile compiles without warnings.

- [x] **Step 2: Update youtube module.** In `youtube/mod.rs`: delete the moved items, add `pub(crate) use crate::proxy::ProxyState;` is NOT needed — instead change internal references (`mod.rs:82,198,207`) to `crate::proxy::ProxyState`, make `YtClient::reset` `pub(crate)`, and fix `youtube/stream.rs:15` to `use crate::proxy::ProxyState;` (drop it from the `super::` list).

- [x] **Step 3: lib.rs.** Add `mod proxy;` (unconditional). Add `.manage(proxy::ProxyState::default())` to the unconditional builder chain (remove `ProxyState` from the desktop `.manage` block — it currently sits there as `youtube::ProxyState`). Register `proxy::set_proxy, proxy::proxy_check` in the desktop handler list (replacing `youtube::set_proxy, youtube::proxy_check`) and in the mobile handler.

- [x] **Step 4: Verify** — `cargo check` in `src-tauri` (desktop). Run `cargo test` (stream.rs unit tests still pass).

- [x] **Step 5: Commit** — `refactor(tauri): move proxy state and commands out of the youtube module`

---

### Task 4: Rust — compile nd + stream:// + shared commands on mobile

**Files:**
- Modify: `src-tauri/src/lib.rs` (`mod nd;`/`mod stream;` un-gated; managed state, protocol, mobile handler)
- Modify: `src-tauri/src/stream.rs:209-211` (cfg-gate the yt arm)
- Modify: `src-tauri/src/nd/prefetch.rs`, `src-tauri/src/nd/cover.rs`, `src-tauri/src/nd/download.rs` (pass `ProxyState` into `forward_get`/reqwest where the proxy argument is currently `None`)

**Interfaces:**
- Consumes: `crate::proxy::ProxyState` from Task 3.
- Produces: mobile invoke handler with `app_data_folder_size`, `proxy::set_proxy`, `proxy::proxy_check`, `nd::nd_set_config`, `nd::nd_prefetch`, `nd::nd_download`, `nd::nd_download_cancel`; `stream://` protocol registered on all platforms.

- [x] **Step 1: lib.rs restructure.**

```rust
#[cfg(desktop)]
mod youtube;

mod nd;
mod proxy;
mod stream;
```

Move out of the desktop-only builder block into the unconditional chain:

```rust
        .manage(proxy::ProxyState::default())
        .manage(nd::NdState::default())
        .manage(nd::NdCoverCache::default())
        .manage(nd::NdAudioCache::default())
        .manage(nd::NdDownloadRegistry::default())
        .register_asynchronous_uri_scheme_protocol("stream", stream::serve)
```

Mobile handler (`lib.rs:138-139`) becomes:

```rust
    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        app_data_folder_size,
        proxy::set_proxy,
        proxy::proxy_check,
        nd::nd_set_config,
        nd::nd_prefetch,
        nd::nd_download,
        nd::nd_download_cancel,
    ]);
```

- [x] **Step 2: stream.rs route.** Gate only the yt arm:

```rust
    #[cfg(desktop)]
    if let Some(id) = path.strip_prefix("yt/") {
        return crate::youtube::stream_yt(app, id, range).await;
    }
```

- [x] **Step 3: Wire the proxy into nd.** In each nd route/command that builds a request (`prefetch.rs` `stream_song`/`nd_prefetch`, `cover.rs` `fetch_cover`, `download.rs` `nd_download`): read `let proxy = app.state::<crate::proxy::ProxyState>().get();` and pass it where the `forward_get` `proxy` argument (or reqwest client builder) currently gets `None`. Follow the exact call sites found at implementation time — do not change `forward_get` itself.

- [x] **Step 4: Verify desktop** — `cargo check` + `cargo test` in src-tauri.

- [x] **Step 5: Verify mobile compiles** — `cargo check --target aarch64-linux-android --lib` (needs `$env:JAVA_HOME`/NDK as set up on 2026-08-18; if the env is unavailable locally, defer to the full `pnpm tauri android build` in Task 9).

- [x] **Step 6: Commit** — `feat(android): navidrome streaming, proxy and storage sizes on mobile`

---

### Task 5: Frontend — open the nd/proxy capabilities on mobile

**Files:**
- Modify: `src/lib/environment/platformCaps.ts`
- Modify: `src/modules/youtube/lib/thumbnail.ts:34`
- Modify: `src/modules/sources/navidrome/config.ts:12-13` (comment only — the flag change does the work)

**Interfaces:**
- Produces: `platformCaps.canProxyStream: IS_TAURI` (the `stream://` scheme now exists everywhere Tauri runs); yt-specific surfaces gate on `canShellSpawn`.

- [x] **Step 1: Flip the flag.** In `platformCaps.ts`:

```ts
  /** Proxying remote streams/covers through the Rust `stream://` layer. */
  canProxyStream: IS_TAURI,
```

- [x] **Step 2: Re-gate yt-only surfaces.** `thumbnail.ts:34` (`ytimg://` is registered by the desktop-only youtube module):

```ts
  if (!platformCaps.canShellSpawn) return sharp;
```

- [x] **Step 3: Audit the remaining `canProxyStream` consumers** (`grep -rn canProxyStream src/`): `navidrome/config.ts` (wanted — now enabled on mobile), `prefetch-next.ts:152` (safe — per-source prefetch goes through the provider registry and the yt provider is already `noopProvider` on mobile via `canShellSpawn`, `provider.ts:106`). Confirm no other consumer assumes yt.

- [x] **Step 4: Verify** — `pnpm vue-tsc --noEmit && pnpm vitest run` (prefetch/provider tests mock the flags explicitly, so they must stay green untouched).

- [x] **Step 5: Commit** — `feat(sources): enable navidrome source and proxy settings on mobile`

---

### Task 6: Settings — hide desktop-only controls on phones

**Files:**
- Modify: `src/lib/environment/platformCaps.ts` (add `hasZoom`)
- Modify: `src/pages/settings/GeneralSettings.vue:65` (autostart/tray group)
- Modify: `src/pages/settings/AppearanceSettings.vue` (zoom row)

**Interfaces:**
- Produces: `platformCaps.hasZoom: IS_TAURI && !IS_MOBILE`.

- [x] **Step 1:** Add to `platformCaps.ts`:

```ts
  /** Webview zoom control (desktop webviews only). */
  hasZoom: IS_TAURI && !IS_MOBILE,
```

- [x] **Step 2: GeneralSettings.vue.** Replace `<template v-if="isTauri">` (`:65`) with `<template v-if="platformCaps.hasNativeWindow">`; import `platformCaps` in the script block. The update-check group stays — Android gets a real updater in Task 8.

- [x] **Step 3: AppearanceSettings.vue.** Wrap the zoom `Item` (around `:57`) in `v-if="platformCaps.hasZoom"`; import `platformCaps`.

- [x] **Step 4: Verify** — `pnpm vue-tsc --noEmit && pnpm lint`. Manual: web build (`pnpm dev`) still shows zoom, hides autostart group.

- [x] **Step 5: Commit** — `fix(settings): hide tray, autostart and zoom controls on mobile`

---

### Task 7: Android permissions + Music folder binding

**Files:**
- Modify: `src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- Modify: `src-tauri/gen/android/app/src/main/java/com/eg/audiogram/MainActivity.kt`
- Modify: `src/modules/watched-folders/composables/useWatchedFolders.ts` (`addFolder` at `:28`, `startWatching` call at `:151`)
- Modify: `src/modules/watched-folders/components/WatchedFoldersSection.vue`
- Modify: `src/app/i18n/locales/en/*.json`, `src/app/i18n/locales/ru/*.json` (the watched-folders namespace — locate the existing `watchedFolders` keys and add `addMusicFolder`)

**Interfaces:**
- Produces: constant `ANDROID_MUSIC_DIR = "/storage/emulated/0/Music"` local to `useWatchedFolders.ts`; `addFolder()` behavior branches on `IS_MOBILE`.

- [x] **Step 1: Manifest.** Add above `<application>`:

```xml
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
```

- [x] **Step 2: MainActivity.kt** — request the audio permission on first launch:

```kotlin
package com.eg.audiogram

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    requestAudioPermission()
  }

  private fun requestAudioPermission() {
    val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
      Manifest.permission.READ_MEDIA_AUDIO
    else
      Manifest.permission.READ_EXTERNAL_STORAGE

    if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(this, arrayOf(permission), 1)
    }
  }
}
```

- [x] **Step 3: useWatchedFolders.** In `addFolder()` (`:28`) branch before the dialog:

```ts
  async function addFolder() {
    if (IS_MOBILE) {
      const result = store.addFolder(ANDROID_MUSIC_DIR);
      // …same post-add flow as the dialog branch (validate result, scanFolder)
      return;
    }
    const selected = await open({ directory: true, /* unchanged */ });
```

(match the exact post-add statements already in the function; `IS_MOBILE` from `@/lib/environment/userAgent`). In the watch startup (`:151`), skip live watching on mobile — the scan already ran:

```ts
      if (IS_MOBILE) return; // inotify is dead on Android FUSE storage; rescans cover it
      const stop = await startWatching(folder.path, /* unchanged */);
```

Place the guard so scan-on-launch and manual rescan still run for the folder.

- [x] **Step 4: WatchedFoldersSection.vue.** On mobile, the add button labels itself "Add Music folder" and hides once the Music folder is present (there is only one bindable folder). Use the existing add-button markup; swap the label via i18n key `watchedFolders.addMusicFolder` when `IS_MOBILE` (expose a computed in script — no template comments). Add en: `"addMusicFolder": "Add Music folder"`, ru: `"addMusicFolder": "Привязать папку Music"` next to the existing add-folder key.

- [x] **Step 5: Tests/verify.** `pnpm vue-tsc --noEmit && pnpm vitest run src/modules/watched-folders && pnpm lint`.

- [x] **Step 6: Commit** — `feat(android): music folder binding with runtime audio permission`

---

### Task 8: Android in-app APK updater

> **Executed with a deviation:** the opener plugin's Android side only ships a URL
> `ACTION_VIEW` (no FileProvider path), so a locally downloaded APK cannot reach the
> system installer. `installUpdateAndroid` therefore `openUrl`s the APK asset URL —
> the browser downloads it and hands it to the installer. No fs write, no
> `REQUEST_INSTALL_PACKAGES` (dropped from the manifest), no AppData `updates/` dir.
> The store gained a mobile early-return in `install()` instead of progress events.

**Files:**
- Create: `src/modules/update/api/androidUpdateApi.ts`
- Modify: `src/modules/update/api/updateApi.ts` (branch to the android impl on mobile)
- Modify: `src/modules/update/composables/useAppUpdates.ts:22-29`
- Modify: `src/lib/environment/platformCaps.ts` (`hasAppUpdater: IS_TAURI`)
- Modify: `.github/workflows/release.yml` publish-manifest job
- Test: `src/modules/update/__tests__/androidUpdateApi.test.ts`

**Interfaces:**
- Consumes: `UpdateInfo`, `UpdateError` from `../types`; manifest URL shape from publish-manifest.
- Produces: `checkUpdateAndroid(): ResultAsync<UpdateInfo | null, UpdateError>`, `installUpdateAndroid(): ResultAsync<void, UpdateError>` (module-level cache of the checked manifest holds the APK URL between the two calls, mirroring how the Rust updater holds its state).

- [x] **Step 1: Manifest gains the APK.** In release.yml "Generate latest.json", after the LINUX vars:

```bash
          ANDROID_URL=$(echo "$RELEASE" | jq -r '.assets[]? | select(.name | test("aarch64\\.apk$")) | .url // empty' | head -n1)
```

Do NOT add it to the required-assets check (the APK job may be skipped). Extend the jq program:

```bash
          jq -n \
            --arg version "${VERSION}" \
            ... existing args ... \
            --arg android_url "$ANDROID_URL" \
            '{
              version: $version,
              notes: $notes,
              pub_date: $pub_date,
              platforms: ({
                "windows-x86_64": { url: $win_url, signature: $win_sig },
                "linux-x86_64": { url: $linux_url, signature: $linux_sig }
              } + (if $android_url != "" then { "android-aarch64": { url: $android_url, signature: "" } } else {} end))
            }' > "docs/manifests/${CHANNEL}/latest.json"
```

- [x] **Step 2: Failing test for the android api** (mock `@tauri-apps/plugin-http` fetch, `@tauri-apps/api/app` getVersion, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-opener`):

```ts
  it("reports an update when the manifest version is newer", async () => {
    mockGetVersion.mockResolvedValue("0.2.2");
    mockFetch.mockResolvedValue(jsonResponse({
      version: "0.2.3", notes: "notes", pub_date: "2026-09-01T00:00:00Z",
      platforms: { "android-aarch64": { url: "https://example/app.apk", signature: "" } },
    }));
    const result = await checkUpdateAndroid();
    expect(result._unsafeUnwrap()).toMatchObject({ version: "0.2.3", currentVersion: "0.2.2" });
  });

  it("returns null when up to date or when the manifest lacks an android entry", async () => { /* version equal → null; platforms without android-aarch64 → null */ });

  it("downloads the apk into appdata and opens it with the system installer", async () => {
    /* after a successful check: installUpdateAndroid() writes updates/Audiogram_<v>.apk
       (writeFile with BaseDirectory.AppData) and calls openPath(<abs appdata path>) */
  });
```

- [x] **Step 3: Implement `androidUpdateApi.ts`.**

```ts
import { ResultAsync } from "neverthrow";
import { fetch } from "@tauri-apps/plugin-http";
import { getVersion } from "@tauri-apps/api/app";
import { writeFile, mkdir, exists, BaseDirectory } from "@tauri-apps/plugin-fs";
import { appDataDir } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import type { UpdateError, UpdateInfo } from "../types";

const MANIFEST_URL = "https://eg0r0k.github.io/audiogram/manifests/stable/latest.json";

interface ManifestPlatform { url: string; signature: string }
interface Manifest {
  version: string;
  notes?: string;
  pub_date?: string;
  platforms: Record<string, ManifestPlatform | undefined>;
}

let stagedApkUrl: string | null = null;
let stagedVersion: string | null = null;

const isNewer = (remote: string, current: string): boolean => {
  const a = remote.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
};

export const checkUpdateAndroid = (): ResultAsync<UpdateInfo | null, UpdateError> =>
  ResultAsync.fromPromise((async () => {
    const currentVersion = await getVersion();
    const response = await fetch(MANIFEST_URL, { method: "GET" });
    if (!response.ok) throw new Error(`manifest fetch failed: ${response.status}`);
    const manifest = await response.json() as Manifest;

    const android = manifest.platforms["android-aarch64"];
    if (!android?.url || !isNewer(manifest.version, currentVersion)) {
      stagedApkUrl = null;
      stagedVersion = null;
      return null;
    }

    stagedApkUrl = android.url;
    stagedVersion = manifest.version;
    return {
      version: manifest.version,
      currentVersion,
      body: manifest.notes ?? null,
      date: manifest.pub_date ?? null,
    };
  })(), (e): UpdateError => ({ kind: "NETWORK", message: String(e) }));

export const installUpdateAndroid = (): ResultAsync<void, UpdateError> =>
  ResultAsync.fromPromise((async () => {
    if (!stagedApkUrl || !stagedVersion) throw new Error("no update staged — check first");

    const response = await fetch(stagedApkUrl, { method: "GET" });
    if (!response.ok) throw new Error(`apk download failed: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());

    if (!(await exists("updates", { baseDir: BaseDirectory.AppData }))) {
      await mkdir("updates", { baseDir: BaseDirectory.AppData, recursive: true });
    }
    const relPath = `updates/Audiogram_${stagedVersion}.apk`;
    await writeFile(relPath, bytes, { baseDir: BaseDirectory.AppData });

    // The system installer takes over from here (REQUEST_INSTALL_PACKAGES +
    // the manifest FileProvider make the content:// handoff work).
    await openPath(`${await appDataDir()}/${relPath}`);
  })(), (e): UpdateError => ({ kind: "INSTALL_FAILED", message: String(e) }));
```

- [x] **Step 4: Branch in `updateApi.ts`.**

```ts
import { IS_MOBILE } from "@/lib/environment/userAgent";
import { checkUpdateAndroid, installUpdateAndroid } from "./androidUpdateApi";

export const installUpdate = (): ResultAsync<void, UpdateError> =>
  IS_MOBILE
    ? installUpdateAndroid()
    : ResultAsync.fromPromise(invoke<void>("install_update"), e => toUpdateError(e, "INSTALL_FAILED"));

export const checkUpdate = (): ResultAsync<UpdateInfo | null, UpdateError> =>
  IS_MOBILE
    ? checkUpdateAndroid()
    : ResultAsync.fromPromise(invoke<UpdateInfo | null>("check_update"), e => toUpdateError(e, "NETWORK"));
```

(The store's tauri-event progress listeners simply never fire on Android — the download shows as indeterminate `downloading`, which the UI already renders when `contentLength` is null.)

- [x] **Step 5: Enable the scheduler on mobile.** `platformCaps.hasAppUpdater: IS_TAURI` (update the doc comment: desktop native updater or the Android APK flow). In `useAppUpdates.ts` delete the now-dead mobile early-return (`:27-29`).

- [x] **Step 6: Verify** — `pnpm vitest run src/modules/update && pnpm vue-tsc --noEmit && pnpm lint`. Sanity-check `openPath` behavior on-device in Task 9 (fallback if the installer does not open: `openUrl(stagedApkUrl)` — swap in during device testing if needed).

- [x] **Step 7: Commit** — `feat(android): in-app apk updater via the release manifest`

---

### Task 9: Device verification, version bump, release v0.2.2

**Files:**
- Modify: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (version 0.2.2)

- [x] **Step 1: Full local gate.** `pnpm vue-tsc --noEmit && pnpm vitest run && pnpm lint && cargo check` (src-tauri).
- [x] **Step 2: Local APK.** `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"; pnpm tauri android build --target aarch64 --apk true`. Hand the APK to the user for on-device checks: import from picker, Music folder binding, Navidrome source appears and plays, proxy check, update check (against the 0.2.1 manifest it must say "up to date"; the flow itself is exercised after the release exists).
- [x] **Step 3: Bump 0.2.2** in all four files (BOM-free writes), commit `chore: bump version to 0.2.2`.
- [ ] **Step 4: Release.** Write release notes (English, no AI patterns, style of v0.2.1), create the GitHub release for tag v0.2.2, push the tag, watch CI (build, build-android, publish-manifest, pages deploy).
- [ ] **Step 5: Post-release.** Verify latest.json contains the `android-aarch64` entry; on-device update check from 0.2.1 → sees 0.2.2, downloads, installer opens.

## Self-review notes

- Spec coverage: import fix (T1+T2), settings gating (T6), nd on mobile (T3+T4+T5), proxy on phones (T3+T4+T5, page already shown via isTauri), /Music binding + permissions (T7), Android updates (T8), release (T9). The "multi-select needs long-press" item is user education — no code.
- Desktop regressions to watch: T3/T4 move managed state — desktop handler list must keep every existing command; `cargo test` covers stream range tests.
- Type consistency: `sniffAudioExtension` (T2 wiring matches its definition), `checkUpdateAndroid`/`installUpdateAndroid` names match between T8 steps.
