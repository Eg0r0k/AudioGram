<template>
  <Button
    v-if="pip.PIP_SUPPORTED"
    size="icon-sm"
    variant="ghost"
    :class="{ 'text-primary': pip.isPipOpen.value }"
    @click="handleToggle"
  >
    <IconPIPFilled
      class="size-4.5"
    />
  </Button>
</template>

<script lang="ts" setup>
import { Button } from "@/components/ui/button";
import {
  onMounted,
  onUnmounted,
} from "vue";
import PIPContent from "./PIPContent.vue";
import { usePictureInPicture } from "@/composables/usePictureInPicture";
import IconPIPFilled from "~icons/tabler/picture-in-picture-filled";
import type { Pinia } from "pinia";
import { getActivePinia } from "pinia";
import { i18n } from "@/app/i18n";

const pinia = getActivePinia();
const pip = usePictureInPicture();
const getPipOptions = () => ({
  component: PIPContent,
  width: 400,
  height: 280,
  plugins: [
    pinia as Pinia,
    i18n,
  ],
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
