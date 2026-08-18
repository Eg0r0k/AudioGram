<template>
  <Transition
    :css="!suppressPanelSlide"
    :enter-active-class="suppressPanelSlide ? '' : 'transition-transform duration-200 ease-standard'"
    :enter-from-class="suppressPanelSlide ? '' : 'translate-x-full'"
    :leave-active-class="suppressPanelSlide ? '' : 'transition-transform duration-200 ease-standard'"
    :leave-to-class="suppressPanelSlide ? '' : 'translate-x-full'"
  >
    <div
      v-if="isSearchOpen"
      class="absolute inset-0 top-[72px] z-20 flex flex-col bg-card overflow-hidden"
    >
      <LibrarySearchPane v-if="source === 'library'" />
      <NdSearchPane v-else-if="source === 'nd'" />
      <YtSearchPane v-else />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useSearch } from "@/modules/search/composables/useSearch";
import LibrarySearchPane from "@/modules/search/components/LibrarySearchPane.vue";
import NdSearchPane from "@/modules/sources/components/NdSearchPane.vue";
import YtSearchPane from "@/modules/youtube/components/search/YtSearchPane.vue";

const { isSearchOpen, source, suppressPanelSlide } = useSearch();
</script>
