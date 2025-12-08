<template>
  <div class="min-w-[180px] w-[30%] pl-2">
    <div class="flex justify-start items-center relative select-none">
      <div
        class="isolate relative shrink-0 mr-2 w-14 h-14 rounded overflow-hidden"
      >
        <img
          class="w-full h-full object-cover object-center absolute left-0 top-0"
          draggable="false"
          :src="currentTrack.cover"
          loading="eager"
          alt=""
        >
      </div>

      <div class="data-track min-w-0 overflow-hidden">
        <MarqueeBlock
          :duration="10"
          animate-on-overflow-only
          pause-on-hover
          gradient
          gradient-color="var(--card)"
          gradient-length="20px"
        >
          <span class="text-sm font-medium">{{ currentTrack.title }}</span>
        </MarqueeBlock>
        <div class="text-muted-foreground text-xs truncate capitalize">
          {{ currentTrack.artist }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import MarqueeBlock from "../ui/marquee/MarqueeBlock.vue";

const tracks = [
  {
    title: "Очень длинное название трека которое точно не поместится",
    artist: "ЛСП",
    cover: "https://i.scdn.co/image/ab67616d000048514feb42ff53928276cf9d9f5a",
  },
  {
    title: "Короткий",
    artist: "Oxxxymiron",
    cover: "https://i.scdn.co/image/ab67616d00004851a1c37f3fd969287c03482c3b",
  },
  {
    title: "Ещё один трек с супер длинным названием для теста marquee",
    artist: "Скриптонит",
    cover: "https://i.scdn.co/image/ab67616d00004851e419ccba0baa8bd3f3d7abf4",
  },
];

const currentIndex = ref(0);
const currentTrack = computed(() => tracks[currentIndex.value]);

const nextTrack = () => {
  currentIndex.value = (currentIndex.value + 1) % tracks.length;
};
</script>

<style scoped>
.data-track {
  display: grid;
  gap: 2px;
  flex: 1;
}
</style>
