<template>
  <div
    class=" relative"
  >
    <Button
      size="icon-sm"
      variant="ghost-primary"
      class="rounded-full"
      @click="toggleMute"
      @wheel.prevent="handleScroll"
    >
      <Icon
        class="size-4.5"
        :icon="volumeIcon"
      />
    </Button>
    <div
      class=" mb-2 absolute left-1/2 p-2 shadow-lg bg-card rounded-md bottom-full -translate-x-1/2 "
      @wheel.prevent="handleScroll"
    >
      <Slider
        v-model="volume"

        :max="100"
        :step="1"
        orientation="vertical"
        class=" h-16! min-h-0!  cursor-pointer"
      />
    </div>
  </div>
</template>
<script lang="ts" setup>
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Icon } from "@iconify/vue";
import { computed, ref } from "vue";

const volume = ref([0]);
const lastVolume = ref(50);
const volumeIcon = computed(() => {
  const v = volume.value[0];
  if (v === 0) return "tabler:volume-off";
  if (v < 30) return "tabler:volume-2";
  return "tabler:volume";
});

const handleScroll = (e: WheelEvent) => {
  const step = 5; // шаг изменения громкости
  const current = volume.value[0];
  let newVolume = current;

  if (e.deltaY > 0) {
    newVolume = Math.max(0, current - step);
  }
  else if (e.deltaY < 0) {
    newVolume = Math.min(100, current + step);
  }
  else {
    return;
  }

  volume.value = [newVolume];
};

const toggleMute = () => {
  if (volume.value[0] > 0) {
    lastVolume.value = volume.value[0];
    volume.value = [0];
  }
  else {
    volume.value = [lastVolume.value > 0 ? lastVolume.value : 0];
  }
};

</script>
