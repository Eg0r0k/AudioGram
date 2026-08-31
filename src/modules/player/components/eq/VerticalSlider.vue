<template>
  <div
    ref="wrapperRef"
    class="flex-1 w-full flex justify-center relative"
  >
    <div class="absolute top-1/2 left-0 right-0 h-px bg-muted-foreground/30 pointer-events-none z-0" />

    <Slider
      v-model="proxyValue"
      :min="min"
      :max="max"
      :step="step"
      orientation="vertical"
      class="min-h-0! h-full!"
      @value-commit="onValueCommit"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { Slider } from "@/components/ui/slider";
import { useEventListener } from "@vueuse/core";

const props = withDefaults(defineProps<{
  modelValue: number;
  min?: number;
  max?: number;
  step?: number;
}>(), {
  min: -12,
  max: 12,
  step: 1,
});

const wrapperRef = useTemplateRef("wrapperRef");

const emit = defineEmits<{
  "update:modelValue": [value: number];
  "change": [value: number];
}>();

const proxyValue = computed({
  get: () => [props.modelValue],
  set: (val) => {
    if (val.length > 0) {
      emit("update:modelValue", val[0]);
    }
  },
});

const onValueCommit = (val: number[]) => {
  if (val.length > 0) {
    emit("change", val[0]);
  }
};

const handleScroll = (e: WheelEvent) => {
  e.preventDefault();
  e.stopPropagation();

  const direction = e.deltaY < 0 ? 1 : -1;
  const delta = direction * props.step;

  const newValue = Math.max(
    props.min,
    Math.min(props.max, props.modelValue + delta),
  );

  if (newValue !== props.modelValue) {
    emit("update:modelValue", newValue);
    emit("change", newValue);
  }
};

useEventListener(wrapperRef, "wheel", handleScroll, { passive: false });
</script>
