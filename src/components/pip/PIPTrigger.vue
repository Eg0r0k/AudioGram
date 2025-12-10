<template>
  <Button
    v-if="pip.PIP_SUPPORTED"
    size="icon-sm"
    variant="ghost"
    :class="{ 'text-primary': pip.isPipOpen.value }"
    @click="handleToggle"
  >
    <Icon
      class="size-4.5"
      :icon="
        pip.isPipOpen
          ? 'ri:picture-in-picture-exit-fill'
          : 'ri:picture-in-picture-fill'
      "
    />
  </Button>
</template>

<script lang="ts" setup>
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/vue";
import {
  onMounted,
  onUnmounted,
} from "vue";
import PIPContent from "./PIPContent.vue";
import { usePictureInPicture } from "@/composables/usePictureInPicture";

const pip = usePictureInPicture();
const getPipOptions = () => ({
  component: PIPContent,
  width: 400,
  height: 280,
});
const handleToggle = async () => {
  await pip.toggle(getPipOptions());
};

onMounted(() => {
  pip.restore(getPipOptions());
});

onUnmounted(() => {
  pip.close();
});
</script>
