<!-- eslint-disable vuejs-accessibility/form-control-has-label -->
<template>
  <div
    ref="containerRef"
    :class="containerClasses"
  >
    <div
      ref="filledRef"
      class="range-selector__filled"
    />
    <div
      v-if="showThumb"
      ref="thumbRef"
      class="range-selector__thumb"
    />
    <input
      ref="seekRef"
      class="range-selector__input"
      type="range"
      :disabled="disabled"
      :step="step"
      :min="min"
      :max="max"
      :value="internalValue"
      :aria-label="$t('common.progress')"
      @input="onInput"
      @keydown="onKeyDown"
    >
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useElementBounding, useEventListener } from "@vueuse/core";
import { clamp } from "@/lib/math";
import { isRTL } from "@/lib/environment/lang";

export interface GrabEvent {
  x: number;
  y: number;
  originalEvent: MouseEvent | TouchEvent;
}
export interface RangeSelectorProps {
  step: number;
  keyboardStep?: number;
  min?: number;
  max?: number;
  showThumb?: boolean;
  withTransition?: boolean;
  useTransform?: boolean;
  vertical?: boolean;
  offsetAxisValue?: number;
  modelValue?: number;
  disableTransition?: boolean;
  disabled?: boolean;
}
const props = withDefaults(defineProps<RangeSelectorProps>(), {
  min: 0,
  max: 100,
  withTransition: false,
  useTransform: true,
  vertical: false,
  offsetAxisValue: 0,
  modelValue: 0,
  showThumb: false,
  disableTransition: false,
  disabled: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: number];
  "mousedown": [event: GrabEvent];
  "mouseup": [event: GrabEvent];
  "scrub": [value: number];
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const filledRef = ref<HTMLDivElement | null>(null);
const seekRef = ref<HTMLInputElement | null>(null);

const mousedown = ref(false);
const internalValue = ref(props.modelValue);

const { width, height, left, bottom } = useElementBounding(containerRef);

const keyStep = computed(() => props.keyboardStep ?? (props.max - props.min) / 20);

const decimals = computed(() => {
  const stepStr = String(props.step);
  const index = stepStr.indexOf(".");
  return index === -1 ? 0 : stepStr.length - index - 1;
});

const containerClasses = computed(() => [
  "range-selector",
  {
    "range-selector--transform": props.useTransform,
    "range-selector--transition": props.withTransition && !props.useTransform && !props.disableTransition,
    "range-selector--active": mousedown.value,
    "range-selector--no-transition": props.disableTransition,
    "range-selector--disabled": props.disabled,
  },
]);

const thumbRef = ref<HTMLDivElement | null>(null);

function setFilled(value: number): void {
  if (!filledRef.value) return;

  let percents = (value - props.min) / (props.max - props.min);
  percents = clamp(percents, 0, 1);

  if (props.useTransform) {
    filledRef.value.style.transform = `scaleX(${percents})`;
  }
  else {
    filledRef.value.style.width = `${percents * 100}%`;
  }

  if (thumbRef.value) {
    thumbRef.value.style.left = `${percents * 100}%`;
  }
}

function setProgress(value: number): void {
  if (!seekRef.value) return;

  seekRef.value.value = String(value);
  const clampedValue = Number(seekRef.value.value);
  setFilled(clampedValue);
  internalValue.value = clampedValue;
}

function addProgress(value: number): void {
  const newValue = clamp(internalValue.value + value, props.min, props.max);
  setProgress(newValue);
  emit("update:modelValue", newValue);
  emit("scrub", newValue);
}

function createGrabEvent(e: MouseEvent | TouchEvent): GrabEvent {
  const touch = "touches" in e ? e.touches[0] : null;
  return {
    x: touch ? touch.clientX : (e as MouseEvent).clientX,
    y: touch ? touch.clientY : (e as MouseEvent).clientY,
    originalEvent: e,
  };
}

function scrub(event: GrabEvent, snapValue?: (value: number) => number): number {
  let rectMax = props.vertical ? height.value : width.value;

  if (props.offsetAxisValue) {
    rectMax -= props.offsetAxisValue;
  }

  let offsetAxisVal = clamp(
    props.vertical
      ? -(event.y - bottom.value)
      : event.x - left.value - props.offsetAxisValue / 2,
    0,
    rectMax,
  );

  if (!props.vertical && isRTL()) {
    offsetAxisVal = rectMax - offsetAxisVal;
  }

  let value = props.min + (offsetAxisVal / rectMax * (props.max - props.min));

  if ((value - props.min) < ((props.max - props.min) / 2)) {
    value -= props.step / 10;
  }

  value = Number(value.toFixed(decimals.value));
  value = clamp(value, props.min, props.max);

  if (snapValue) {
    value = snapValue(value);
  }

  setProgress(value);
  emit("update:modelValue", value);
  emit("scrub", value);

  return value;
}

function onInput(): void {
  if (props.disabled || !seekRef.value) return;

  const value = Number(seekRef.value.value);
  setFilled(value);
  internalValue.value = value;
  emit("update:modelValue", value);
  emit("scrub", value);
}

function onPointerDown(e: MouseEvent | TouchEvent): void {
  if (props.disabled) return;
  const grabEvent = createGrabEvent(e);
  mousedown.value = true;
  scrub(grabEvent);
  emit("mousedown", grabEvent);
}

function onPointerMove(e: MouseEvent | TouchEvent): void {
  if (!mousedown.value) return;

  e.preventDefault();
  const grabEvent = createGrabEvent(e);
  scrub(grabEvent);
}

function onPointerUp(e: MouseEvent | TouchEvent): void {
  if (!mousedown.value) return;

  const grabEvent = createGrabEvent(e);
  mousedown.value = false;
  emit("mouseup", grabEvent);
}

function onKeyDown(e: KeyboardEvent): void {
  if (props.disabled) return;
  const isArrowKey = e.key === "ArrowLeft" || e.key === "ArrowRight"
    || e.key === "ArrowUp" || e.key === "ArrowDown";

  if (!isArrowKey) return;

  e.preventDefault();
  e.stopPropagation();

  const isIncrease = e.key === "ArrowRight" || e.key === "ArrowUp";
  const step = isIncrease ? keyStep.value : -keyStep.value;

  addProgress(step);
}

useEventListener(containerRef, "mousedown", onPointerDown);
useEventListener(containerRef, "touchstart", onPointerDown, { passive: true });

useEventListener(document, "mousemove", onPointerMove);
useEventListener(document, "mouseup", onPointerUp);
useEventListener(document, "touchmove", onPointerMove, { passive: false });
useEventListener(document, "touchend", onPointerUp);

watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue !== undefined && newValue !== internalValue.value) {
      setProgress(newValue);
    }
  },
  { immediate: true },
);

defineExpose({
  setProgress,
  addProgress,
  getValue: () => internalValue.value,
});
</script>

<style scoped>
.range-selector {
  --range-height: 3px;
  --range-height-hover: 5px;
  --range-bg: var(--border);
  --range-bg-hover: var(--muted);
  --range-filled: var(--primary);
  --range-radius: 0;

  position: relative;
  display: flex;
  align-items: flex-end;
  width: 100%;
  height: var(--range-height-hover);
  cursor: pointer;
  touch-action: none;
  user-select: none;
}

.range-selector::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--range-height);
  background-color: var(--range-bg);
  border-radius: var(--range-radius);
  transition: height 0.15s ease, background-color 0.15s ease;
}

.range-selector--disabled {
  cursor: not-allowed;
  opacity: 0.5;
  pointer-events: none;
}

.range-selector:hover::before,
.range-selector--active::before {
  height: var(--range-height-hover);
  background-color: var(--range-bg-hover);
}

.range-selector__filled {
  position: absolute;
  left: 0;
  bottom: 0;
  height: var(--range-height);
  border-radius: var(--range-radius);
  background-color: var(--range-filled);
  pointer-events: none;
  transform-origin: left center;
  transition: height 0.15s ease;
}

.range-selector:hover .range-selector__filled,
.range-selector--active .range-selector__filled {
  height: var(--range-height-hover);
}

/* Transform режим — БЕЗ transition на transform */
.range-selector--transform .range-selector__filled {
  width: 100%;
  transform: scaleX(0);
  will-change: transform;
}

/* Width режим с transition */
.range-selector--transition .range-selector__filled {
  transition: width 0.1s linear, height 0.15s ease;
}

/* Отключаем transition при скраббинге */
.range-selector--active .range-selector__filled {
  transition: height 0.15s ease !important;
}

/* Полное отключение transition (при смене трека) */
.range-selector--no-transition .range-selector__filled {
  transition: none !important;
}

.range-selector__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  opacity: 0;
  appearance: none;
  -webkit-appearance: none;
}

.range-selector__input:focus-visible {
  outline: none;
}

.range-selector:has(.range-selector__input:focus-visible) {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

.range-selector__thumb {
  position: absolute;
  bottom: 50%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background-color: var(--range-filled);
  transform: translate(-50%, 50%);
  pointer-events: none;
}

</style>
