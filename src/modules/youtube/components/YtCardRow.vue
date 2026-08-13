<template>
  <section class="flex flex-col gap-1">
    <div class="flex items-center justify-between px-2">
      <h2 class="text-lg font-semibold">
        {{ title }}
      </h2>
      <Button
        v-if="showAll"
        variant="ghost-primary"
        size="sm"
        class="rounded-full text-xs"
        @click="emit('showAll')"
      >
        {{ $t("search.showAll") }}
      </Button>
    </div>
    <Scrollable
      direction="horizontal"
      hide-thumb
    >
      <div class="flex gap-1 px-1 pb-1">
        <slot />
      </div>
    </Scrollable>
  </section>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Scrollable } from "@/components/ui/scrollable";

defineProps<{
  title: string;
  showAll?: boolean;
}>();

const emit = defineEmits<{
  showAll: [];
}>();
</script>
