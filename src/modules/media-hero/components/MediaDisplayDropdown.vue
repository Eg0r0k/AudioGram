<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        class="text-white"
      >
        <component
          :is="currentOption.icon"
          class="size-5"
        />
        {{ $t(`${currentOption.label}`) }}
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent
      side="bottom"
      align="end"
    >
      <DropdownMenuLabel class="text-xs">
        {{ $t('media.display.label') }}
      </DropdownMenuLabel>

      <DropdownMenuItem
        v-for="option in viewOptions"
        :key="option.value"
        :class="{ 'text-primary!': viewMode === option.value }"
        @click="viewMode = option.value"
      >
        <component
          :is="option.icon"
          class="size-5"
        />

        {{ $t(`${option.label}`) }}

        <IconCheck
          v-if="viewMode === option.value"
          class="size-4 ml-auto"
        />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

import IconCheck from "~icons/tabler/check";

import { useLibraryView, viewOptions } from "@/modules/library/composables/useLibraryView";

const { viewMode, currentOption } = useLibraryView();
</script>
