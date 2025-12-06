import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./style.css";
import { createPinia } from "pinia";
import { i18n } from "./i18n";
import vRipple from "./directives/ripple";

const pinia = createPinia();
const app = createApp(App);
app.use(router);
app.use(pinia);
app.use(i18n);
app.directive("ripple", vRipple);
app.mount("#app");
