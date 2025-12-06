<template>
  <div
    ref="dropZoneRef"
    class="app-grid overflow-hidden h-dvh antialiased"
    :style="{
      paddingTop: top,
      paddingRight: right,
      paddingBottom: bottom,
      paddingLeft: left,
    }"
  >
    <WindowToolbar class="toolbar" />
    <Header class="header" />
    <DropOverlay :show="isDragging" />
    <div class="content-area">
      <ResizableSidebar>
        <!-- <Tabs v-model="currentTab" class="flex flex-col h-full">
          <Scrollable
            :hide-thumb="true"
            direction="horizontal"
            class="shrink-0"
          >
            <TabsList>
              <TabsTrigger value="music">Music</TabsTrigger>
              <TabsTrigger value="podcasts">Podcasts</TabsTrigger>
              <TabsTrigger value="audiobooks">Audiobooks</TabsTrigger>
            </TabsList>
          </Scrollable>

          <div
            ref="swipeContainer"
            class="flex-1 h-full relative min-h-0 overflow-hidden flex flex-col"
          >
            <Scrollable direction="vertical" class="flex-1 w-full">
              <TabsContent value="music" class="mt-0 p-1">
                <Button variant="ghost" class="w-full">
                  <Icon icon="tabler:music" />
                  Music
                </Button>
              </TabsContent>

              <TabsContent value="podcasts" class="mt-0 p-1">
                <Button
                  v-for="i in 20"
                  :key="i"
                  variant="destructive-link"
                  class="w-full"
                >
                  <Icon icon="tabler:music" />
                  Music {{ i }}
                </Button>
              </TabsContent>

              <TabsContent value="audiobooks" class="mt-0"> </TabsContent>
            </Scrollable>
          </div>
        </Tabs> -->
      </ResizableSidebar>

      <main role="main" class="main">
        <RouterView />
      </main>
    </div>

    <FooterMediaPlayer class="footer" />
  </div>
</template>

<script setup lang="ts">
import Tabs from "@/components/ui/tabs/Tabs.vue";
import TabsContent from "@/components/ui/tabs/TabsContent.vue";
import TabsList from "@/components/ui/tabs/TabsList.vue";
import TabsTrigger from "@/components/ui/tabs/TabsTrigger.vue";
import { useDropZone, useScreenSafeArea } from "@vueuse/core";
import { Icon } from "@iconify/vue";
import Button from "@/components/ui/button/Button.vue";
import Scrollable from "@/components/ui/scrollable/Scrollable.vue";
import WindowToolbar from "@/components/WindowToolbar.vue";
import FooterMediaPlayer from "@/components/layout/footer/FooterMediaPlayer.vue";
import ResizableSidebar from "@/components/layout/sidebar/ResizableSidebar.vue";
import Header from "@/components/layout/header/Header.vue";
import { useSwipeControl } from "@/composables/useSwipeControl";
import { computed, ref, useTemplateRef } from "vue";
import DropOverlay from "@/components/layout/dropzone/DropOverlay.vue";
import { useFileDrop } from "@/composables/useFileDrop";

function processFiles(files: File[]) {
  files.forEach((file) => {
    console.log("File:", file.name);
    // @ts-ignore - relativePath добавляется динамически
    console.log("Path:", file.relativePath || file.path || file.name);
  });
}

const { isDragging, droppedFiles, isProcessing } = useFileDrop({
  acceptedExtensions: [".mp3", ".flac", ".wav", ".ogg"],
  onDrop: (files) => {
    console.log("Dropped:", files);
    processFiles(files);
  },
});

const { top, right, bottom, left } = useScreenSafeArea();
// const swipeContainer = ref<HTMLElement | null>(null);
// const TABS = ["music", "podcasts", "audiobooks"];
// const currentTab = ref("music");
// const nextTab = () => {
//   const currentIndex = TABS.indexOf(currentTab.value);
//   if (currentIndex < TABS.length - 1) {
//     currentTab.value = TABS[currentIndex + 1];
//   } else {
//     currentTab.value = TABS[0];
//   }
// };

// const prevTab = () => {
//   const currentIndex = TABS.indexOf(currentTab.value);
//   if (currentIndex > 0) {
//     currentTab.value = TABS[currentIndex - 1];
//   } else {
//     currentTab.value = TABS[TABS.length - 1];
//   }
// };

// useSwipeControl(swipeContainer, {
//   threshold: 70,
//   onSwipeLeft: nextTab,
//   onSwipeRight: prevTab,
// });
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
