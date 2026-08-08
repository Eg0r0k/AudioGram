<template>
  <nav
    v-if="IS_TAURI && !IS_MOBILE"
    data-tauri-drag-region
    role="toolbar"
    :aria-label="$t('common.window.titlebar')"
    class="titlebar"
  >
    <div
      class="titlebar-left"
      data-tauri-drag-region
    >
      <button
        class="nav-btn"
        type="button"
        :disabled="!canGoBack"
        :aria-label="$t('common.back')"
        :title="$t('common.back')"
        @click="goBack"
      >
        <IconChevronLeft class="size-4" />
      </button>
      <button
        class="nav-btn"
        type="button"
        :aria-label="$t('common.next')"
        :title="$t('common.next')"
        @click="goNext"
      >
        <IconChevronRight class="size-4" />
      </button>
    </div>

    <div class="titlebar-controls">
      <button
        class="ctl"
        type="button"
        :aria-label="$t('common.window.minimize')"
        :title="$t('common.window.minimize')"
        @click="minimize"
      >
        <svg
          class="ctl-icon"
          viewBox="0 0 10 10"
        >
          <path d="M1 5 H9" />
        </svg>
      </button>
      <button
        class="ctl"
        type="button"
        :aria-label="isMaximized ? $t('common.window.restore') : $t('common.window.maximize')"
        :title="isMaximized ? $t('common.window.restore') : $t('common.window.maximize')"
        @click="toggleMaximize"
      >
        <svg
          v-if="isMaximized"
          class="ctl-icon"
          viewBox="0 0 10 10"
        >
          <path d="M3 1 H9 V7" />
          <rect
            x="1"
            y="3"
            width="6"
            height="6"
          />
        </svg>
        <svg
          v-else
          class="ctl-icon"
          viewBox="0 0 10 10"
        >
          <rect
            x="1"
            y="1"
            width="8"
            height="8"
          />
        </svg>
      </button>
      <button
        class="ctl ctl-close"
        type="button"
        :aria-label="$t('common.window.close')"
        :title="$t('common.window.close')"
        @click="close"
      >
        <svg
          class="ctl-icon"
          viewBox="0 0 10 10"
        >
          <path d="M1 1 L9 9 M9 1 L1 9" />
        </svg>
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { Window } from "@tauri-apps/api/window";
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { IS_MOBILE, IS_TAURI } from "@/lib/environment/userAgent";
import IconChevronLeft from "~icons/tabler/chevron-left";
import IconChevronRight from "~icons/tabler/chevron-right";

import useTauriEvent from "@/composables/tauri/useTauriEvent";

const router = useRouter();
const canGoBack = true;
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
  height: 32px;
  display: flex;
  align-items: center;
  position: relative;
  background: var(--accent);
  user-select: none;
}

.titlebar-left {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 80px; /* matches the compact sidebar column (SIDEBAR_COMPACT_WIDTH) */
  height: 100%;
  -webkit-app-region: no-drag;
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.nav-btn:hover:not(:disabled) {
  background: color-mix(in oklab, var(--accent), var(--foreground) 10%);
  color: var(--foreground);
}

.nav-btn:active:not(:disabled) {
  background: color-mix(in oklab, var(--accent), var(--foreground) 16%);
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.nav-btn:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}

.titlebar-controls {
  margin-left: auto;
  display: flex;
  align-items: stretch;
  height: 100%;
  -webkit-app-region: no-drag;
}

.ctl {
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.ctl:hover {
  background: color-mix(in oklab, var(--accent), var(--foreground) 10%);
  color: var(--foreground);
}

.ctl:active {
  background: color-mix(in oklab, var(--accent), var(--foreground) 16%);
}

.ctl:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}

.ctl-close:hover {
  background: #e81123;
  color: #ffffff;
}

.ctl-close:active {
  background: #c50f1f;
  color: #ffffff;
}

.ctl-icon {
  width: 11px;
  height: 11px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1;
  shape-rendering: geometricPrecision;
}

@media (prefers-reduced-motion: reduce) {
  .nav-btn,
  .ctl {
    transition: none;
  }
}
</style>
