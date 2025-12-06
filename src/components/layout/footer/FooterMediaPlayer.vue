<script setup lang="ts">
import PlayBarControls from "@/components/player/PlayBarControls.vue";
import PlayerBarNotification from "@/components/player/PlayerBarNotification.vue";
import SidebarControls from "@/components/player/SidebarControls.vue";
import SidebarMusic from "@/components/player/SidebarMusic.vue";
import { AnimatePresence, Motion } from "motion-v";
import { ref } from "vue";
import FooterMobile from "./FooterMobile.vue";
const isOpen = ref(false);
</script>

<template>
  <footer role="contentinfo" class="p-2 bg-card border-t">
    <aside role="complementary">
      <div class="flex items-center justify-between h-[78px]">
        <SidebarMusic />

        <PlayBarControls />
        <SidebarControls />
      </div>
      <AnimatePresence>
        <Motion
          v-if="isOpen"
          :initial="{
            opacity: 0,
            y: 20,
            height: 0,
          }"
          :animate="{
            opacity: 1,
            y: 0,
            height: 'auto',
          }"
          :exit="{
            opacity: 0,
            y: 20,
            height: 0,
          }"
          :transition="{
            duration: 0.2,
            ease: 'easeInOut',
          }"
          class="overflow-hidden"
        >
          <PlayerBarNotification />
        </Motion>
      </AnimatePresence>
    </aside>
    <FooterMobile class="hidden" />
  </footer>
</template>
