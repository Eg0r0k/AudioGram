<template>
  <Empty class="h-full bg-card">
    <EmptyMedia>
      <IconPlaylist class="size-32 text-muted-foreground" />
    </EmptyMedia>
  </Empty>
</template>

<script setup lang="ts">
import { Empty, EmptyMedia } from "@/components/ui/empty";
import IconPlaylist from "~icons/audiogram/logo";
</script>
