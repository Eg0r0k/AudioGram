<template>
  <DropdownMenu v-if="store.availableSources.length > 1">
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon-lg"
        class="rounded-full shrink-0"
        :aria-label="$t(sourceUI(store.currentSource).labelKey)"
        :title="$t(sourceUI(store.currentSource).labelKey)"
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
        v-for="ui in sourceOptions"
        :key="ui.kind"
        @click="store.setSource(ui.kind)"
      >
        <component
          :is="ui.icon"
          class="size-5"
        />
        {{ $t(ui.labelKey) }}
        <IconCheck
          v-if="store.currentSource === ui.kind"
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
import { sourceUI } from "../lib/source-ui";
import { useCurrentSourceStore } from "../store/currentSource.store";

const store = useCurrentSourceStore();

const sourceOptions = computed(() => store.availableSources.map(sourceUI));

// MorphIcon wants the parsed glyph, and svgToIcon is not free — parse each
// source's once rather than on every trigger re-render.
const morphIcons = computed(() =>
  new Map(sourceOptions.value.map(ui => [ui.kind, svgToIcon(ui.iconRaw)])),
);
const currentSourceIcon = computed(() => morphIcons.value.get(store.currentSource));
</script>
