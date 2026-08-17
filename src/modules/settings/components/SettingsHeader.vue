<template>
  <SettingsGroup
    class="sticky top-0 h-[72px] z-15 bg-background border-b   "
    :class="isScrolled ? 'border-b dark:border-background' : 'border-transparent'"
  >
    <div class="flex px-2 gap-6 items-center">
      <Button
        variant="ghost"
        size="icon-lg"
        class="rounded-full"
        @click="$router.back()"
      >
        <IconArrowLeft
          class="size-6"
        />
      </Button>
      <h1 class="font-bold text-xl py-3">
        {{ title }}
      </h1>
    </div>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { inject, computed } from "vue";
import { scrollableInjectionKey } from "@/components/ui/scrollable/injection";
import Button from "@/components/ui/button/Button.vue";
import SettingsGroup from "./SettingsGroup.vue";
import IconArrowLeft from "~icons/tabler/arrow-left";

defineProps<{
  title: string;
}>();

const scrollable = inject(scrollableInjectionKey);

const isScrolled = computed(() => !scrollable?.isScrolledToStart.value);
</script>
