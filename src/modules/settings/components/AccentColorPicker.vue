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

    <Popover>
      <PopoverTrigger as-child>
        <button
          type="button"
          aria-label="Pick a custom accent color"
          class="relative flex size-8 cursor-pointer items-center justify-center
                 rounded-full transition-[transform,box-shadow] duration-200 hover:scale-110
                 focus-visible:outline-2 focus-visible:outline-offset-2
                 focus-visible:outline-primary"
          :style="{ background: customSwatchBackground }"
        >
          <svg
            v-if="modelValue === 'custom'"
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
          <IconColorPicker
            v-else
            class="size-6 text-white drop-shadow"
          />

          <span
            v-if="modelValue === 'custom'"
            class="absolute -inset-1 rounded-full ring-1 ring-offset-1 ring-offset-transparent"
            :style="{ '--tw-ring-color': customColor }"
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        class="w-auto p-3"
        align="start"
      >
        <ColorPicker
          class="w-64"
          format="hexa"
          :model-value="customColor"
          @update:model-value="onCustomColorChange"
        />
      </PopoverContent>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ColorPicker } from "@/components/ui/color-picker";
import IconColorPicker from "~icons/tabler/palette-filled";
import type { AccentColorOption } from "@/modules/settings/accent-colors";
import { AccentColor } from "../schema/appearance";

const props = defineProps<{
  modelValue: AccentColor;
  colors: AccentColorOption[];
  customColor: string;
}>();

const emit = defineEmits<{
  select: [color: AccentColor];
  selectCustom: [color: string];
}>();

// The chosen color when active; a hue wheel as the "anything else" affordance.
const customSwatchBackground = computed(() =>
  props.modelValue === "custom"
    ? props.customColor
    : "conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
);

function onCustomColorChange(value: string | object | null) {
  if (typeof value === "string") emit("selectCustom", value);
}
</script>
