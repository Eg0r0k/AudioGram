<template>
  <div class="flex flex-wrap gap-3">
    <button
      v-for="color in colors"
      :key="color.value"
      type="button"
      :aria-label="`Select ${color.label} accent color`"
      class="relative flex size-8 cursor-pointer items-center justify-center
             rounded-full transition-[transform,box-shadow] duration-200 hover:scale-110
             focus-visible:outline-2 focus-visible:outline-offset-2
             focus-visible:outline-primary"
      :style="{ backgroundColor: color.preview }"
      @click="$emit('select', color.value)"
    >
      <Transition
        enter-active-class="transition-[opacity,transform] duration-200"
        enter-from-class="scale-0 opacity-0"
        enter-to-class="scale-100 opacity-100"
        leave-active-class="transition-[opacity,transform] duration-150"
        leave-from-class="scale-100 opacity-100"
        leave-to-class="scale-0 opacity-0"
      >
        <svg
          v-if="modelValue === color.value"
          xmlns="http://www.w3.org/2000/svg"
          class="size-4 text-white drop-shadow"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </Transition>

      <span
        v-if="modelValue === color.value"
        class="absolute -inset-1 rounded-full ring-1 ring-offset-1 ring-offset-transparent"
        :style="{ borderColor: 'transparent', '--tw-ring-color': color.preview }"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { AccentColorOption } from "@/modules/settings/accent-colors";
import { AccentColor } from "../schema/appearance";

defineProps<{
  modelValue: AccentColor;
  colors: AccentColorOption[];
}>();

defineEmits<{
  select: [color: AccentColor];
}>();
</script>
