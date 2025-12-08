<script setup lang="ts">
import { Volume2 } from "lucide-vue-next";
import { isPlayingElsewhere, playingTab } from "@/composables/tabSync";
</script>

<template>
  <div
    v-if="isPlayingElsewhere && playingTab"
    class="flex bg-primary flex-row text-primary-foreground justify-center items-center h-8 px-3 rounded-sm gap-2"
  >
    <Volume2 :size="16" />
    <span class="text-sm font-semibold">
      {{ $t("player.herePlaying") }}:
      <span class="ml-1">
        {{ playingTab.browser }} {{ playingTab.browser.name }}
      </span>
    </span>
  </div>
</template>
