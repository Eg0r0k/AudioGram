<template>
  <div
    ref="dropZoneRef"
    class="app-grid overflow-hidden h-dvh antialiased pt-[env(safe-area-inset-top,0px)] pr-[env(safe-area-inset-right,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)]"
  >
    <WindowToolbar class="toolbar" />
    <DropOverlay :show="isDragging" />

    <div class="content-area">
      <ResizableSidebar>
        <LibrarySidebar />
      </ResizableSidebar>

      <main
        id="main"
        class="main"
      >
        <slot />
      </main>
      <aside class="right-column bg-card border-l dark:border-background">
        <RightPanelHost />
      </aside>
    </div>

    <FooterMediaPlayer class="footer" />
  </div>
</template>

<script setup lang="ts">
import WindowToolbar from "@/components/WindowToolbar.vue";
import FooterMediaPlayer from "@/components/layout/footer/FooterMediaPlayer.vue";
import ResizableSidebar from "@/components/layout/sidebar/ResizableSidebar.vue";
import LibrarySidebar from "@/components/layout/sidebar/LibrarySidebar.vue";
import DropOverlay from "@/components/DropOverlay.vue";
import { useImport } from "@/modules/library/composables/useImport";
import { useFileDrop } from "@/composables/useFileDrop";
import { registerOverlayBackHandler, useOverlayEscape } from "@/composables/useOverlayBackButton";
import { ACCEPTED_AUDIO_EXTENSIONS } from "@/lib/files/acceptedAudioExtensions";
import RightPanelHost from "@/modules/right-panel/components/RightPanelHost.vue";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { panelBackDepth } from "@/modules/right-panel/lib/backChain";

useOverlayEscape();

const rightPanel = useRightPanelStore();
registerOverlayBackHandler({
  depth: () => panelBackDepth(rightPanel.isOpen, rightPanel.view, rightPanel.returnToView),
  back: () => rightPanel.stepBack(),
});

const { importFiles } = useImport();

const { isDragging } = useFileDrop({
  acceptedExtensions: [...ACCEPTED_AUDIO_EXTENSIONS],
  onDrop: (files) => {
    importFiles(files);
  },
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
 .right-column {
  width: 390px;
  min-width: 320px;
  overflow-y: hidden;
  overflow-x: hidden;
}

.footer {
  grid-area: footer;
}
</style>
