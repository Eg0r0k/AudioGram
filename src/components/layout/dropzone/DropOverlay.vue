<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="drop-overlay">
        <div class="drop-zone">
          <div class="drop-outline-wrapper">
            <svg width="100%" height="100%">
              <rect
                class="drop-outline-path"
                x="1"
                y="1"
                width="calc(100% - 2px)"
                height="calc(100% - 2px)"
                rx="12"
                ry="12"
              />
            </svg>
          </div>

          <div class="drop-content text-primary">
            <Icon icon="tabler:file-music" class="w-16 h-16" />
            <h2 class="text-xl font-semibold mt-4">Перетащите файлы сюда</h2>
            <p class="text-xs mt-2 text-muted-foreground">
              MP3, FLAC, WAV, OGG
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";

defineProps<{
  show: boolean;
}>();
</script>

<style scoped>
.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-dropoverlay);
  display: flex;
  background: hsl(var(--background) / 0.9);
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(3px);
  pointer-events: none;
}

.drop-zone {
  position: relative;
  background: var(--card);
  border-radius: var(--radius-xl);
  padding: 1.5rem;
  text-align: center;
  pointer-events: none;
}

.drop-outline-wrapper {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.drop-outline-path {
  fill: none;
  stroke: var(--primary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-dasharray: 13.5, 11;
  stroke-dashoffset: 0;
  animation: drop-outline-move 0.5s linear infinite;
}

.drop-content {
  display: flex;
  padding: 2rem;
  align-items: center;
  flex-direction: column;
  width: 100%;
  border-radius: var(--radius-lg);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes drop-outline-move {
  0% {
    stroke-dashoffset: 0;
  }
  100% {
    stroke-dashoffset: -24.5;
  }
}
</style>
