<template>
  <nav data-tauri-drag-region role="toolbar" class="titlebar" v-if="isTauriApp">
    <div class="titlebar-text">
      <Button @click="goBack" size="icon-xs" variant="ghost">
        <Icon icon="tabler:chevron-left" />
      </Button>
      <Button @click="goNext" size="icon-xs" variant="ghost">
        <Icon icon="tabler:chevron-right" />
      </Button>
      <!-- <Button size="icon-xs" @click="handleThemeToggle">
        <component :is="themeIcon" />
      </Button> -->
    </div>
    <div class="titlebar-controls">
      <button
        class="titlebar-button"
        @click="minimizeWindow"
        :title="$t('common.window.minimize')"
      >
        —
      </button>
      <button
        class="titlebar-button"
        @click="toggleMaximize"
        :title="
          isMaximized
            ? $t('common.window.restore')
            : $t('common.window.maximize')
        "
      >
        ☐
      </button>
      <button
        class="titlebar-button titlebar-close"
        @click="closeWindow"
        :title="$t('common.window.close')"
      >
        ✕
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { isTauri } from "@tauri-apps/api/core";
import { Window } from "@tauri-apps/api/window";
import { computed, onMounted, ref } from "vue";
import { Button } from "./ui/button";
import { Icon } from "@iconify/vue";
import { useTheme } from "@/composables/useTheme";
import { Moon, Sun } from "lucide-vue-next";
import { useRouter } from "vue-router";

const router = useRouter();

const goNext = () => router.go(1);
const goBack = () => router.back();

const theme = useTheme();
const isTauriApp = ref(false);
const themeIcon = computed(() => (theme.isDark.value ? Sun : Moon));
const handleThemeToggle = (event: MouseEvent) => {
  theme.toggleTheme(event);
};
const appWindow = ref<Window | null>(null);
const isMaximized = ref(false);

const minimizeWindow = () => appWindow.value?.minimize();
const closeWindow = () => appWindow.value?.close();

const toggleMaximize = async () => {
  if (!appWindow.value) return;
  isMaximized.value = await appWindow.value.isMaximized();
  if (isMaximized.value) {
    await appWindow.value.unmaximize();
  } else {
    await appWindow.value.maximize();
  }
  isMaximized.value = !isMaximized.value;
};

onMounted(async () => {
  isTauriApp.value = await isTauri();
  if (isTauriApp.value) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    appWindow.value = await getCurrentWindow();
    isMaximized.value = await appWindow.value.isMaximized();
  }
});
</script>

<style scoped>
.titlebar {
  z-index: var(--z-toolbar);
  height: 26px;
  padding: 0 0 0 8px;
  background-color: var(--card);
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
