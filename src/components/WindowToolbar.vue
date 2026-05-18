<template>
  <nav
    v-if="IS_TAURI && !IS_MOBILE"
    data-tauri-drag-region
    role="toolbar"
    class="titlebar bg-accent"
  >
    <div class="titlebar-text">
      <Button
        size="icon-xs"
        variant="ghost"
        :disabled="!canGoBack"
        @click="goBack"
      >
        <IconChevronLeft />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        @click="goNext"
      >
        <IconChevronRight />
      </Button>
    </div>
    <div class="titlebar-controls">
      <button
        class="titlebar-button"
        :aria-label="$t('common.window.minimize')"
        :title="$t('common.window.minimize')"
        @click="minimize"
      >
        —
      </button>
      <button
        class="titlebar-button"
        :aria-label="
          isMaximized
            ? $t('common.window.restore')
            : $t('common.window.maximize')
        "
        :title="
          isMaximized
            ? $t('common.window.restore')
            : $t('common.window.maximize')
        "
        @click="toggleMaximize"
      >
        ☐
      </button>
      <button
        class="titlebar-button titlebar-close"
        :aria-label="$t('common.window.close')"
        :title="$t('common.window.close')"
        @click="close"
      >
        ✕
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { Window } from "@tauri-apps/api/window";
import { computed, onMounted, ref } from "vue";
import { Button } from "./ui/button";
import { useRouter } from "vue-router";
import { IS_MOBILE, IS_TAURI } from "@/lib/environment/userAgent";
import IconChevronLeft from "~icons/tabler/chevron-left";
import IconChevronRight from "~icons/tabler/chevron-right";

import useTauriEvent from "@/composables/tauri/useTauriEvent";

const router = useRouter();
const canGoBack = computed(() => window.history.length > 1);
const goNext = () => router.go(1);
const goBack = () => router.back();

const appWindow = ref<Window | null>(null);
const isMaximized = ref(false);

const minimize = () => appWindow.value?.minimize();
const close = () => appWindow.value?.close();

const toggleMaximize = async () => {
  if (!appWindow.value) return;
  try {
    if (isMaximized.value) {
      await appWindow.value.unmaximize();
    }
    else {
      await appWindow.value.maximize();
    }
  }
  catch (error) {
    console.warn("Maximize toggle failed", error);
  }
};

onMounted(async () => {
  if (!IS_TAURI) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  appWindow.value = await getCurrentWindow();
  isMaximized.value = await appWindow.value.isMaximized();

  useTauriEvent("tauri://resize", async () => {
    try {
      isMaximized.value = await appWindow.value?.isMaximized() ?? false;
    }
    catch {
      // noop
    }
  });
});
</script>

<style scoped>
.titlebar {
  z-index: var(--z-toolbar);
  height: 26px;
  padding: 0 0 0 8px;
  /* background-color: var(--card); */
  display: flex;
  align-items: center;
  user-select: none;
  -webkit-app-region: drag;
  position: relative;
}

.titlebar-text {
  display: flex;
  gap: 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--foreground);
  -webkit-app-region: no-drag;
}

.titlebar-controls {
  font-size: 12px;
  margin-left: auto;
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.titlebar-button {
  width: 46px;
  height: 100%;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: background-color 0.2s ease;
}

.titlebar-button:hover {
  background-color: var(--color-muted, #cccccc);
}

.titlebar-button:active {
  background-color: var(--color-muted-foreground, #e5e5e5);
}

.titlebar-close:hover {
  background-color: #e81123;
  color: white;
}

.titlebar-close:active {
  background-color: #bf0f1d;
}

.titlebar-button svg {
  pointer-events: none;
}

@media (max-width: 600px) {
  .titlebar-text {
    font-size: 12px;
  }
}
@media (max-width: 200px) {
  .titlebar-text {
    display: none;
  }
}
</style>
