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
      <YtSearchPane v-if="source === 'yt'" />
      <SourceSearchPane
        v-else
        :kind="source"
      />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useSearch } from "@/modules/search/composables/useSearch";
import { registerOverlayBackHandler } from "@/composables/useOverlayBackButton";
import SourceSearchPane from "@/modules/search/components/SourceSearchPane.vue";
import YtSearchPane from "@/modules/youtube/components/search/YtSearchPane.vue";

const { isSearchOpen, source, suppressPanelSlide, closeSearch } = useSearch();

registerOverlayBackHandler({
  depth: () => (isSearchOpen.value ? 1 : 0),
  back: closeSearch,
});
</script>
