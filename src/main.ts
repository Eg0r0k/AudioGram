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
import { initLogging } from "./lib/logger";

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

if ("serviceWorker" in navigator && !IS_TAURI) {
  navigator.serviceWorker.register("/opfs-sw.js").catch(console.error);
}

app.directive("ripple", vRipple);
app.directive("copy", vCopy);

app.mount("#app");
