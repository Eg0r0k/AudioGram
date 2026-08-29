<template>
  <div
    v-if="isMobileLayout"
    class="flex flex-1 min-h-0 flex-col"
  >
    <LibrarySidebar class="h-full bg-card" />
  </div>
  <Scrollable
    v-else
    class="flex-1"
  >
    <div class="relative flex flex-col gap-4  items-center justify-center  h-full overflow-hidden bg-background">
      <IconLogo class=" text-accent size-45" />
      <div class="flex flex-col">
        <div class="flex flex-col gap-2 w-[256px]">
          <div class="flex w-full justify-between ">
            <span class=" text-sm text-muted-foreground font-medium">
              {{ $t('nav.search') }}
            </span>

            <KbdGroup>
              <Kbd>Ctrl + F</Kbd>
            </KbdGroup>
          </div>
          <div class="flex w-full justify-between ">
            <span class=" text-sm text-muted-foreground font-medium">
              {{ $t('nav.queue') }}
            </span>

            <KbdGroup>
              <Kbd>Q</Kbd>
            </KbdGroup>
          </div>
        </div>
      </div>
    </div>
  </Scrollable>
</template>
<script lang="ts" setup>
import LibrarySidebar from "@/components/layout/sidebar/LibrarySidebar.vue";
import { KbdGroup, Kbd } from "@/components/ui/kbd";
import Scrollable from "@/components/ui/scrollable/Scrollable.vue";
import { useDeviceLayout } from "@/composables/useDeviceLayout";
import IconLogo from "~icons/audiogram/logo";
const { isMobileLayout } = useDeviceLayout();

</script>
