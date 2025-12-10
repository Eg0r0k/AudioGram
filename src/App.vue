<template>
  <component :is="LayoutComponent">
    <RouterView v-slot="{ Component, route }">
      <component
        :is="Component"
        :key="route.fullPath"
      />
    </RouterView>
  </component>

  <Toaster
    position="top-center"
    class="pointer-events-auto"
  />
</template>

<script setup lang="ts">
import { Toaster } from "@/components/ui/sonner";
import { toast } from "vue-sonner";

import { useTheme } from "./composables/useTheme";
import "vue-sonner/style.css";
import DefaultLayout from "./layouts/DefaultLayout.vue";
import BlankLayout from "./layouts/BlankLayout.vue";
import { type Component, computed, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { useSetupRootClasses } from "./composables/useSetupRootClasses";
import { listenForOpenedFiles, OpenedFile } from "./helpers/files/fileOpener";

const route = useRoute();
const layouts: Record<string, Component> = {
  default: DefaultLayout,
  blank: BlankLayout,
};

const LayoutComponent = computed(() => {
  const layoutName = route.meta.layout ?? "default";
  return layouts[layoutName] ?? DefaultLayout;
});

let unlisten: (() => void) | null = null;

onMounted(async () => {
  unlisten = await listenForOpenedFiles((files: OpenedFile[]) => {
    files.forEach((file) => {
      toast.success(`▶️ Воспроизводится: ${file.name}`, {
        description: file.path,
        duration: 5000,
      });
    });
  });
});

onUnmounted(() => {
  unlisten?.();
});

useTheme();
useSetupRootClasses();
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
