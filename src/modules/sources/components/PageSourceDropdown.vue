<template>
  <DropdownMenu v-if="store.availableSources.length > 1">
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon-lg"
        class="rounded-full shrink-0"
        :aria-label="$t(`library.source.${store.currentSource}`)"
        :title="$t(`library.source.${store.currentSource}`)"
      >
        <MorphIcon
          :icon="currentSourceIcon"
          spring="snappy"
          reduced-motion="user"
          class="size-6"
        />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      class="w-52"
      align="end"
    >
      <DropdownMenuItem
        v-for="kind in store.availableSources"
        :key="kind"
        @click="store.setSource(kind)"
      >
        <IconServer
          v-if="kind === 'nd'"
          class="size-5"
        />
        <IconDeviceLaptop
          v-else
          class="size-5"
        />
        {{ $t(`library.source.${kind}`) }}
        <IconCheck
          v-if="store.currentSource === kind"
          class="ml-auto size-4"
        />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { computed } from "vue";
import { MorphIcon } from "morphicons/vue";
import { svgToIcon } from "morphicons/adapters";
import IconCheck from "~icons/tabler/check";
import IconDeviceLaptop from "~icons/tabler/device-laptop";
import IconServer from "~icons/tabler/server";
import serverRaw from "~icons/tabler/server?raw";
import laptopRaw from "~icons/tabler/device-laptop?raw";
import { useCurrentSourceStore } from "../store/currentSource.store";

const store = useCurrentSourceStore();

const serverIcon = svgToIcon(serverRaw);
const laptopIcon = svgToIcon(laptopRaw);
const currentSourceIcon = computed(() =>
  store.currentSource === "nd" ? serverIcon : laptopIcon,
);

</script>
