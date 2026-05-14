<template>
  <div
    ref="dropZoneRef"
    class="app-grid  overflow-hidden h-dvh antialiased"
    :style="{
      paddingTop: top,
      paddingRight: right,
      paddingBottom: bottom,
      paddingLeft: left,
    }"
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
import { useScreenSafeArea } from "@vueuse/core";
import WindowToolbar from "@/components/WindowToolbar.vue";
import FooterMediaPlayer from "@/components/layout/footer/FooterMediaPlayer.vue";
import ResizableSidebar from "@/components/layout/sidebar/ResizableSidebar.vue";
import LibrarySidebar from "@/components/layout/sidebar/LibrarySidebar.vue";
import DropOverlay from "@/components/DropOverlay.vue";
import { useImport } from "@/composables/useImport";
import { useFileDrop } from "@/composables/useFileDrop";
import RightPanelHost from "@/modules/right-panel/components/RightPanelHost.vue";

const { importFiles } = useImport();

const { isDragging } = useFileDrop({
  acceptedExtensions: [".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac", ".opus"],
  onDrop: (files) => {
    importFiles(files);
  },
});

const { top, right, bottom, left } = useScreenSafeArea();
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
