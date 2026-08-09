<template>
  <component :is="LayoutComponent">
    <RouterView v-slot="{ Component, route }">
      <SlideTransition :depth="route.meta.depth">
        <component
          :is="Component"
          :key="route.fullPath"
          class="page-wrapper bg-muted dark:bg-background"
        />
      </SlideTransition>
    </RouterView>
  </component>
  <WhatsNewDialog />
  <ExternalLinkDialog />
  <ImportProgressHost />
  <DeleteConfirmDialog />
  <NetworkStatusToast />
  <Toaster
    :expand="true"
    position="top-center"
    class="pointer-events-auto"
  />
</template>

<script setup lang="ts">
import "vue-sonner/style.css";
import { Toaster } from "@/components/ui/sonner";
import { type Component as VueComponent, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";
import DefaultLayout from "@/layouts/DefaultLayout.vue";
import BlankLayout from "@/layouts/BlankLayout.vue";
import MobileLayout from "@/layouts/MobileLayout.vue";
import { listenForOpenedFiles, OpenedFile } from "@/lib/files/fileOpener";
import { useTheme } from "@/modules/settings/composables/useTheme";
import { useSetupRootClasses } from "@/composables/useSetupRootClasses";
import { usePreventPinchZoom } from "@/composables/usePreventPinchZoom";
import { useGeneralSettings } from "@/modules/settings/store/general";
import SlideTransition from "@/components/transitions/SlideTransition.vue";
import ExternalLinkDialog from "@/components/dialogs/ExternalLinkDialog.vue";
import { useAccentColor } from "@/modules/settings/composables/useAccentColor";
import { useAudioSettings } from "@/modules/settings/composables/useAudioSettings";
import { useDeviceLayout } from "@/composables/useDeviceLayout";
import { useWatchedFolders } from "@/modules/watched-folders/composables/useWatchedFolders";
import { useGlobalHotKeys } from "@/modules/hotkeys";
import { useMediaSession } from "@/modules/player/composables/useMediaSession";
import { useDiscordPresence } from "@/modules/player/composables/useDiscordPresence";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { useAppUpdates } from "@/modules/update/composables/useAppUpdates";
import { useChangelogOnStartup } from "@/modules/update/composables/useChangelogOnStartup";
import WhatsNewDialog from "@/modules/update/components/WhatsNewDialog.vue";
import { useTrayBehavior } from "@/modules/settings/composables/useTrayBehavior";
import { useProxySync } from "@/modules/settings/composables/useProxySync";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { ephemeralFromPath } from "@/modules/player/types";
import DeleteConfirmDialog from "@/components/dialogs/DeleteConfirmDialog.vue";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { useNowPlayingTitle } from "@/modules/player/composables/useNowPlayingTitle";
import { useExternalLinkInterceptor } from "@/composables/useExternalLinkInterceptor";
import ImportProgressHost from "@/components/ImportProgressHost.vue";
import { usePlayerStore } from "@/modules/player";
import { useEventListener } from "@vueuse/core";
import NetworkStatusToast from "@/components/NetworkStatusToast.vue";
import { useAnalysisQueueLifecycle } from "@/modules/recommendations/composables/useAnalysisQueueLifecycle";
import { getLogger } from "@/lib/logger";

const log = getLogger();
log.info(` \n
8""""8                                                
8    8 e   e eeeee e  eeeee eeeee eeeee  eeeee eeeeeee
8eeee8 8   8 8   8 8  8  88 8   8 8   8  8   8 8  8  8
88   8 8e  8 8e  8 8e 8   8 8e    8eee8e 8eee8 8e 8  8
88   8 88  8 88  8 88 8   8 88 "8 88   8 88  8 88 8  8
88   8 88ee8 88ee8 88 8eee8 88ee8 88   8 88  8 88 8  8
\n
Curious? Join us at https://github.com/Eg0r0k/Audiogram/issues :D
`);

const currentRoute = useRoute();
const { isMobileLayout } = useDeviceLayout();
const { init } = useWatchedFolders();
const playerStore = usePlayerStore();
const queueStore = useQueueStore();
const rightPanelStore = useRightPanelStore();

const layouts: Record<string, VueComponent> = {
  default: DefaultLayout,
  blank: BlankLayout,
  mobile: MobileLayout,
};

const LayoutComponent = computed(() => {
  if (currentRoute.meta.layout === "blank") return BlankLayout;
  if (isMobileLayout.value) return MobileLayout;

  const layoutName = currentRoute.meta.layout ?? "default";
  return layouts[layoutName] ?? DefaultLayout;
});

let unlisten: (() => void) | null = null;
const { init: initGeneral } = useGeneralSettings();

onMounted(async () => {
  initGeneral();

  if (IS_TAURI) {
    const [{ useTauriGlobalShortcuts }] = await Promise.all([
      import("@/modules/hotkeys/composables/useTauriGlobalShortcuts"),
    ]);

    useTauriGlobalShortcuts();
  }

  unlisten = await listenForOpenedFiles(async (files: OpenedFile[]) => {
    if (files.length === 0) return;

    const tracks = files.map(file =>
      ephemeralFromPath(file.path, {
        title: file.name.replace(/\.[^.]+$/, ""),
      }),
    );
    await queueStore.setQueue(tracks, 0, { type: "external" });
  });

  init();
});
onUnmounted(() => {
  unlisten?.();
});

useTheme();
useAccentColor();
useSetupRootClasses();
usePreventPinchZoom();
useAudioSettings();
useGlobalHotKeys();
useMediaSession();
useDiscordPresence();
useNowPlayingTitle();

useExternalLinkInterceptor();

useAnalysisQueueLifecycle();
useAppUpdates();
useChangelogOnStartup();

if (IS_TAURI) {
  useTrayBehavior();
  useProxySync();
}

watch(() => currentRoute.fullPath, (fullPath) => {
  rightPanelStore.invalidateRouteScope(fullPath);
});

const stop = useEventListener(document, "click", () => {
  playerStore.unlockAudio();
  stop();
});

</script>

<style scoped>
.app-grid {
  display: grid;
  grid-template-areas:
    "toolbar"
    "header"
    "content"
    "footer";
  grid-template-rows: auto auto 1fr auto;
}

.toolbar {
  grid-area: toolbar;
}

.header {
  grid-area: header;
}

.content-area {
  grid-area: content;
  display: flex;
  overflow: hidden;
}

.main {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
}

.footer {
  grid-area: footer;
}
</style>
