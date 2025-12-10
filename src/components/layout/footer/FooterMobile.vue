<template>
  <div class="h-[60px] flex gap-2 items-center">
    <Button
      as-child
      variant="ghost"
    >
      <Link
        class="flex flex-col h-full items-center flex-1 gap-1"
        to="/"
      >
        <Icon
          class=" size-7"
          icon="tabler:home-filled"
        />
        <span class="text-xs">Home</span>
      </Link>
    </Button>
    <Button
      as-child
      variant="ghost"
    >
      <Link
        class="flex flex-col h-full items-center flex-1 gap-1"
        to="/settings"
      >
        <Icon
          class=" size-7"
          icon="tabler:home-filled"
        />
        <span class="text-xs">Home</span>
      </Link>
    </Button>
    <Button
      as-child
      variant="ghost"
    >
      <Link
        class="flex flex-col h-full items-center flex-1 gap-1"
        to="/"
      >
        <Icon
          class=" size-7"
          icon="tabler:home-filled"
        />
        <span class="text-xs">Home</span>
      </Link>
    </Button>
    <Button
      as-child
      variant="ghost"
    >
      <Link
        class="flex flex-col h-full items-center flex-1 gap-1"
        to="/"
      >
        <Icon
          class=" size-7"
          icon="tabler:home-filled"
        />
        <span class="text-xs">Home</span>
      </Link>
    </Button>
  </div>
</template>
<script setup lang="ts">
import { Link } from "@/components/ui/link";
import { Icon } from "@iconify/vue";
import { Button } from "@/components/ui/button";
</script>
