<template>
  <Transition
    enter-active-class="transition-transform duration-200 ease-standard"
    enter-from-class="translate-x-full"
    leave-active-class="transition-transform duration-200 ease-standard"
    leave-to-class="translate-x-full"
  >
    <div
      v-if="isSearchOpen"
      class="absolute inset-0 top-[72px] z-20 flex flex-col bg-card overflow-hidden"
    >
      <LibrarySearchPane v-if="source === 'library'" />
      <YtSearchPane v-else />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useSearch } from "@/modules/search/composables/useSearch";
import LibrarySearchPane from "@/modules/search/components/LibrarySearchPane.vue";
import YtSearchPane from "@/modules/youtube/components/search/YtSearchPane.vue";

const { isSearchOpen, source } = useSearch();
</script>
