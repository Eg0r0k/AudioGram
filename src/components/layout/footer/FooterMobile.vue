<template>
  <div class="h-[60px] items-center">
    <Link class="flex flex-col items-center flex-1 gap-1" to="/">
      <Icon width="24" icon="tabler:home-filled" />
      <span class="text-xs">Home</span>
    </Link>
    <Link class="flex flex-col items-center flex-1 gap-1" to="/">
      <Icon width="24" icon="tabler:home-filled" />
      <span class="text-xs">Home</span>
    </Link>
    <Link class="flex flex-col items-center flex-1 gap-1" to="/">
      <Icon width="24" icon="tabler:home-filled" />
      <span class="text-xs">Home</span>
    </Link>
    <Link class="flex flex-col items-center flex-1 gap-1" to="/">
      <Icon width="24" icon="tabler:home-filled" />
      <span class="text-xs">Home</span>
    </Link>
  </div>
</template>
<script setup lang="ts">
import { Link } from "@/components/ui/link";
import { Icon } from "@iconify/vue";
</script>
