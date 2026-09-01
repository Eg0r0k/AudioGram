<template>
  <div class="absolute bottom-0 left-2 right-2">
    <div class="h-0.5 w-full bg-white/50 rounded-full">
      <div
        class="h-full bg-white rounded-full"
        :style="{ width: `${progress}%` }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue";
import { miniPlayerProgressKey } from "./mini-player-context";

const progress = inject(miniPlayerProgressKey);
if (!progress) throw new Error("MiniPlayerProgress must be rendered inside MiniPlayer");
</script>
