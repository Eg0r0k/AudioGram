<template>
  <Button
    v-if="PIP_SUPPORTED"
    size="icon-sm"
    variant="ghost"
    :class="{ 'text-primary': isPipOpen }"
    @click="togglePip"
  >
    <Icon
      class="size-4.5"
      :icon="
        isPipOpen
          ? 'ri:picture-in-picture-exit-fill'
          : 'ri:picture-in-picture-fill'
      "
    />
  </Button>
</template>

<script lang="ts" setup>
import { Button } from "@/components/ui/button";
import { IS_MOBILE, IS_TAURI } from "@/helpers/environment/userAgent";
import { Icon } from "@iconify/vue";
import {
  createApp,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  type App,
} from "vue";
import PIPContent from "./PIPContent.vue";
import vRipple from "@/directives/ripple";

const PIP_SUPPORTED
  = !IS_MOBILE && !IS_TAURI && "documentPictureInPicture" in window;

const pipWindow = shallowRef<Window | null>(null);
const pipApp = shallowRef<App<Element> | null>(null);
const isPipOpen = ref(false);

const cloneStyles = (target: Document): void => {
  document.querySelectorAll("style, link[rel=\"stylesheet\"]").forEach((el) => {
    target.head.appendChild(el.cloneNode(true));
  });

  const rootStyles = getComputedStyle(document.documentElement);
  const cssVars = Array.from(rootStyles)
    .filter(prop => prop.startsWith("--"))
    .map(prop => `${prop}: ${rootStyles.getPropertyValue(prop)}`)
    .join(";");

  const style = target.createElement("style");
  style.textContent = `:root { ${cssVars} }`;
  target.head.appendChild(style);
};

const setupPip = (win: Window): void => {
  pipWindow.value = win;
  isPipOpen.value = true;

  win.document.body.style.cssText = "margin: 0; overflow: hidden;";
  cloneStyles(win.document);

  const container = win.document.createElement("div");
  container.id = "pip-app";
  container.style.cssText = "width: 100%; height: 100%;";
  win.document.body.appendChild(container);

  const app = createApp(PIPContent);
  app.directive("ripple", vRipple);
  app.mount(container);
  pipApp.value = app;

  win.addEventListener("pagehide", handleWindowClose);
};

const togglePip = async (): Promise<void> => {
  if (isPipOpen.value) {
    closePip();
    return;
  }

  try {
    const win = await window.documentPictureInPicture.requestWindow({
      width: 400,
      height: 280,
    });

    setupPip(win);
  }
  catch (e) {
    console.error("[PIP] Failed to open:", e);
  }
};

const closePip = (): void => {
  if (pipApp.value) {
    pipApp.value.unmount();
    pipApp.value = null;
  }
  if (pipWindow.value) {
    pipWindow.value.close();
    pipWindow.value = null;
  }
  isPipOpen.value = false;
};

const handleWindowClose = (): void => {
  if (pipApp.value) {
    pipApp.value.unmount();
    pipApp.value = null;
  }
  pipWindow.value = null;
  isPipOpen.value = false;
};

// Проверяем существующее PIP окно при монтировании
onMounted(() => {
  if (!PIP_SUPPORTED) return;

  try {
    const existingWindow = window.documentPictureInPicture.window;
    if (existingWindow) {
      setupPip(existingWindow);
    }
  }
  catch (e) {
    console.error("[PIP] Init error:", e);
  }
});

// ИСПРАВЛЕНО: передаём функцию, а не вызываем её
onUnmounted(() => {
  closePip();
});
</script>
