<template>
  <div class="flex min-w-[180px] w-[30%] justify-end">
    <div class="flex w-full gap-0.5 justify-end items-center grow">
      <Button size="icon-sm" variant="ghost-primary" class="rounded-full">
        <Icon class="size-4.5" icon="tabler:volume" />
      </Button>
      <Button size="icon-sm" variant="ghost">
        <Icon class="size-4.5" icon="tabler:device-speaker-filled" />
      </Button>
      <Button size="icon-sm" variant="ghost">
        <Icon class="size-4.5" icon="tabler:playlist" />
      </Button>

      <Button size="icon-sm" variant="ghost">
        <Icon class="size-4.5" icon="tabler:devices-2" />
      </Button>
      <PIPTrigger />
      <FullscreenTrigger />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/vue";
import PIPTrigger from "@/components/pip/PIPTrigger.vue";
import FullscreenTrigger from "../layout/fullscreen/FullscreenTrigger.vue";
</script>
