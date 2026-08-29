import { createApp } from "vue";
import { createPinia } from "pinia";
import { VueQueryPlugin } from "@tanstack/vue-query";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import router from "./app/router";
import vRipple from "./directives/ripple";
import "./style.css";
import { i18n } from "@/app/i18n";
import App from "@/app/App.vue";
import { IS_TAURI } from "./lib/environment/userAgent";
import { vCopy } from "./directives/copy";
import { queryClient } from "@/queries/client";
import { getLogger, initLogging } from "./lib/logger";
import { initMediaServerBase } from "./lib/stream-url";
import { initPlayerLifecycle } from "@/modules/player/player-lifecycle";
import { initDownloadManager } from "@/modules/downloads/manager";
import { sweepOrphanedEntities } from "@/services/library-gc";
import { hideAndroidSplash } from "@/lib/android-splash";
import { initZoom } from "@/modules/settings/composables/useZoom";
import { statsService } from "@/services/stats.service";
import { invalidateStatsQueries } from "@/queries/stats.queries";
import { onAllDataCleared } from "@/services/storage-info.service";
import { resetSearchIndex } from "@/modules/search/searchIndex";
import { openDatabase } from "@/db";

await initLogging();

// Media URL builders are synchronous over this cached base — it must exist
// before any store resolves playback or covers (incl. queue restore).
// No-op outside Tauri. The Rust server binds before the webview, so this
// cannot race server readiness.
await initMediaServerBase().catch(error =>
  getLogger().error(`[MediaServer] base init failed: ${String(error)}`),
);

// Open IndexedDB once, up front, so an upgrade/quota failure is classified
// and logged with its code instead of surfacing as an opaque error on the
// first query. Startup continues either way (Dexie auto-opens on use); the
// user-facing screen for a dead database is a separate follow-up.
const dbOpen = await openDatabase();
if (dbOpen.isErr()) {
  getLogger().error(`[DB] open failed (${dbOpen.error.code}): ${dbOpen.error.message}`);
}

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

const app = createApp(App);

if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
}

app.use(router);
app.use(pinia);
app.use(i18n);
app.use(VueQueryPlugin, { queryClient });

// Cross-store reactions to track lifecycle events (stats, queue advance,
// sleep-after-track) — registered once, ordered explicitly.
initPlayerLifecycle();

// Services stay below the query/search layers; their effects on those layers
// are wired here.
statsService.onChange(() => invalidateStatsQueries(queryClient));
onAllDataCleared(resetSearchIndex);

// Download queue: requeue interrupted jobs, sweep temp orphans, resume.
// No-op outside Tauri. Failures must not block app startup.
initDownloadManager().catch(error =>
  getLogger().error(`[Downloads] Init failed: ${String(error)}`),
);

// One-off per launch: drop album/artist rows that lost their last track
// before the deletion cascade existed. Failures must not block startup.
sweepOrphanedEntities().catch(error =>
  getLogger().error(`[LibraryGC] Sweep failed: ${String(error)}`),
);

// Re-apply the persisted zoom; previously it only kicked in once the user
// visited a settings page.
initZoom();

if ("serviceWorker" in navigator && !IS_TAURI) {
  navigator.serviceWorker.register("/opfs-sw.js").catch(console.error);
}

app.directive("ripple", vRipple);
app.directive("copy", vCopy);

app.mount("#app");

router.isReady().then(() => {
  requestAnimationFrame(() => requestAnimationFrame(hideAndroidSplash));
});
