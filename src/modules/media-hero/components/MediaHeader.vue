<template>
  <header
    class="fixed w-full top-0 z-10 transition-all duration-200 ease-standard"
    :class="isScrolled ? '' : 'bg-transparent'"
    :style="headerStyle"
  >
    <div class="flex items-center gap-7 sm:px-6 px-4 py-4">
      <Button
        variant="ghost"
        size="icon-lg"
        class="rounded-full shrink-0 text-white"
        @click="goBack()"
      >
        <IconArrowLeft class="size-6" />
      </Button>

      <div class="flex-1 min-w-0">
        <Transition
          enter-active-class="transition-all duration-200 ease-standard"
          enter-from-class="opacity-0 translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-150 ease-standard"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-1"
          mode="out-in"
        >
          <h1
            v-if="isScrolled"
            class=" font-extrabold text-2xl truncate text-white"
          >
            {{ title }}
          </h1>
        </Transition>
      </div>

      <Transition
        enter-active-class="transition-all duration-200 ease-standard"
        enter-from-class="opacity-0 scale-75"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition-all duration-150 ease-standard"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-75"
        mode="out-in"
      >
        <Button
          v-if="isScrolled"
          size="icon-lg"
          class="rounded-full shrink-0"
          :aria-label="$t('player.play')"
          @click="$emit('play')"
        >
          <IconPlay class="size-4" />
        </Button>
      </Transition>
    </div>
  </header>
</template>

<script setup lang="ts">
import { inject, computed, type ComputedRef } from "vue";
import { Button } from "@/components/ui/button";
import IconArrowLeft from "~icons/tabler/arrow-left";
import IconPlay from "~icons/audiogram/play-rounded";

import { useRouter } from "vue-router";
import { routeLocation } from "@/app/router/route-locations";

const router = useRouter();

const props = defineProps<{
  title: string;
  color?: string | null;
}>();

defineEmits<{
  play: [];
}>();

interface ScrollableContext {
  scrollPosition: ComputedRef<number> & { value: number };
}

const scrollable = inject<ScrollableContext | null>("scrollable", null);

const isScrolled = computed(() => {
  if (!scrollable) return false;
  return scrollable.scrollPosition.value > 60;
});

const fallbackRoute = routeLocation.home();

const goBack = () => {
  const prevPath = router.options.history.state?.back;

  if (prevPath && typeof prevPath === "string") {
    router.back();
  }
  else {
    router.push(fallbackRoute);
  }
};

const headerStyle = computed(() => {
  if (!isScrolled.value) {
    return { background: "transparent" };
  }

  return {
    background: props.color ?? "var(--color-background)",
  };
});
</script>
