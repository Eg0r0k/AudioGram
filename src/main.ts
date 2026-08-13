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
import { initPlayerLifecycle } from "@/modules/player/player-lifecycle";
import { initDownloadManager } from "@/modules/downloads/manager";
import { initZoom } from "@/modules/settings/composables/useZoom";

await initLogging();

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

// Download queue: requeue interrupted jobs, sweep temp orphans, resume.
// No-op outside Tauri. Failures must not block app startup.
initDownloadManager().catch(error =>
  getLogger().error(`[Downloads] Init failed: ${String(error)}`),
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
