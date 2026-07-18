<!-- eslint-disable vuejs-accessibility/form-control-has-label -->
<template>
  <ContextMenu>
    <ContextMenuTrigger
      as-child
      :disabled="!allowMarking || disabled"
    >
      <div
        ref="containerRef"
        :class="containerClasses"
      >
        <div class="range-selector__track">
          <div
            v-for="(segment, i) in segments"
            :key="i"
            class="range-selector__segment"
            :class="{ 'range-selector__segment--hover': hoverSegmentIndex === i }"
            :style="segmentStyle(segment)"
          />
        </div>

        <div
          ref="hoverFilledRef"
          class="range-selector__hover-filled"
          style="display: none"
        />
        <div
          ref="filledRef"
          class="range-selector__filled"
        />
        <div
          v-if="showThumb"
          ref="thumbRef"
          class="range-selector__thumb"
        />

        <div
          v-if="showTooltip && (isHovering || mousedown) && hoverTimeLabel"
          class="range-selector__tooltip"
          :style="tooltipStyle"
        >
          <span
            v-if="hoverChapterTitle"
            class="range-selector__tooltip-title"
          >{{ hoverChapterTitle }}</span>
          <span class="range-selector__tooltip-time">{{ hoverTimeLabel }}</span>
        </div>

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
    </ContextMenuTrigger>

    <ContextMenuContent v-if="allowMarking">
      <ContextMenuItem @select="handleAddMark">
        {{ $t("player.addMarkAt", { time: formatTime(pendingMarkTime) }) }}
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useElementBounding, useEventListener } from "@vueuse/core";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { clamp } from "@/lib/math";
import { isRTL } from "@/lib/environment/lang";

export interface GrabEvent {
  x: number;
  y: number;
  originalEvent: MouseEvent | TouchEvent;
}

export interface RangeSelectorChapter {
  time: number;
  title?: string;
}

interface Segment {
  start: number; // percent, 0-100
  end: number; // percent, 0-100
  title?: string;
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
  chapters?: RangeSelectorChapter[];
  duration?: number;
  showTooltip?: boolean;
  allowMarking?: boolean;
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
  chapters: () => [],
  duration: undefined,
  showTooltip: true,
  allowMarking: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: number];
  "mousedown": [event: GrabEvent];
  "mouseup": [event: GrabEvent];
  "scrub": [value: number];
  "addMark": [value: number];
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const filledRef = ref<HTMLDivElement | null>(null);
const seekRef = ref<HTMLInputElement | null>(null);
const thumbRef = ref<HTMLDivElement | null>(null);
const hoverFilledRef = ref<HTMLDivElement | null>(null);

const mousedown = ref(false);
const internalValue = ref(props.modelValue);

const isHovering = ref(false);
const hoverPercent = ref(0);
const pendingMarkTime = ref(0);

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
    "range-selector--hovering": isHovering.value,
    "range-selector--no-transition": props.disableTransition,
    "range-selector--disabled": props.disabled,
  },
]);

const segments = computed<Segment[]>(() => {
  if (!props.chapters.length || !props.duration) {
    return [{ start: 0, end: 100 }];
  }

  const sorted = [...props.chapters].sort((a, b) => a.time - b.time);
  const dur = props.duration;
  const result: Segment[] = [];

  if (sorted[0].time > 0) {
    result.push({ start: 0, end: clamp((sorted[0].time / dur) * 100, 0, 100) });
  }

  for (let i = 0; i < sorted.length; i++) {
    const nextTime = sorted[i + 1]?.time ?? dur;
    result.push({
      start: clamp((sorted[i].time / dur) * 100, 0, 100),
      end: clamp((nextTime / dur) * 100, 0, 100),
      title: sorted[i].title,
    });
  }

  return result;
});

const hasChapters = computed(() => segments.value.length > 1);

function segmentStyle(segment: Segment): Record<string, string> {
  if (!hasChapters.value) {
    return { left: "0%", width: "100%" };
  }
  return {
    left: `calc(${segment.start}% + 2px)`,
    width: `calc(${Math.max(segment.end - segment.start, 0)}% - 4px)`,
  };
}

const hoverSegmentIndex = computed(() => {
  if (!isHovering.value && !mousedown.value) return -1;
  const list = segments.value;
  return list.findIndex((seg, i) =>
    hoverPercent.value >= seg.start
    && (hoverPercent.value < seg.end || i === list.length - 1),
  );
});

const hoverChapterTitle = computed(() => {
  const idx = hoverSegmentIndex.value;
  return idx >= 0 ? segments.value[idx]?.title ?? null : null;
});

function formatTime(totalSeconds: number): string {
  if (!isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const hoverTimeLabel = computed(() => {
  if (!props.duration || (!isHovering.value && !mousedown.value)) return null;
  return formatTime((hoverPercent.value / 100) * props.duration);
});

const tooltipStyle = computed(() => {
  const percent = hoverPercent.value;
  let translateX = "-50%";
  if (percent < 8) translateX = "0%";
  else if (percent > 99) translateX = "-100%";
  return {
    left: `${percent}%`,
    transform: `translateX(${translateX})`,
  };
});

function setHoverFilled(percent: number): void {
  const el = hoverFilledRef.value;
  if (!el) return;
  const show = props.duration && (isHovering.value || mousedown.value);
  el.style.display = show ? "block" : "none";
  el.style.width = `${percent}%`;
}

function calcPercentFromPosition(x: number, y: number): number {
  let rectMax = props.vertical ? height.value : width.value;

  if (props.offsetAxisValue) {
    rectMax -= props.offsetAxisValue;
  }

  let offsetAxisVal = clamp(
    props.vertical
      ? -(y - bottom.value)
      : x - left.value - props.offsetAxisValue / 2,
    0,
    rectMax,
  );

  if (!props.vertical && isRTL()) {
    offsetAxisVal = rectMax - offsetAxisVal;
  }

  return rectMax > 0 ? clamp((offsetAxisVal / rectMax) * 100, 0, 100) : 0;
}

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
  const percent = calcPercentFromPosition(event.x, event.y);
  let value = props.min + (percent / 100) * (props.max - props.min);

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
  const percent = calcPercentFromPosition(grabEvent.x, grabEvent.y);
  hoverPercent.value = percent;
  isHovering.value = true;
  mousedown.value = true;
  setHoverFilled(percent);
  scrub(grabEvent);
  emit("mousedown", grabEvent);
}

function onPointerMove(e: MouseEvent | TouchEvent): void {
  if (!mousedown.value) return;

  e.preventDefault();
  const grabEvent = createGrabEvent(e);
  const percent = calcPercentFromPosition(grabEvent.x, grabEvent.y);
  hoverPercent.value = percent;
  setHoverFilled(percent);
  scrub(grabEvent);
}

function onPointerUp(e: MouseEvent | TouchEvent): void {
  if (!mousedown.value) return;

  const grabEvent = createGrabEvent(e);
  mousedown.value = false;
  setHoverFilled(0);
  emit("mouseup", grabEvent);
}

function onContainerHover(e: MouseEvent): void {
  if (props.disabled) return;
  const percent = calcPercentFromPosition(e.clientX, e.clientY);
  hoverPercent.value = percent;
  isHovering.value = true;
  setHoverFilled(percent);
}

function onContainerLeave(): void {
  isHovering.value = false;
  setHoverFilled(0);
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

function onContextMenuCapture(e: MouseEvent): void {
  if (!props.allowMarking || props.disabled) return;
  const percent = calcPercentFromPosition(e.clientX, e.clientY);
  pendingMarkTime.value = props.min + (percent / 100) * (props.max - props.min);
}

function handleAddMark(): void {
  emit("addMark", pendingMarkTime.value);
}

useEventListener(containerRef, "mousedown", onPointerDown);
useEventListener(containerRef, "touchstart", onPointerDown, { passive: true });
useEventListener(containerRef, "mousemove", onContainerHover);
useEventListener(containerRef, "mouseleave", onContainerLeave);
useEventListener(containerRef, "contextmenu", onContextMenuCapture);

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

.range-selector--disabled {
  cursor: not-allowed;
  opacity: 0.5;
  pointer-events: none;
}

.range-selector__track {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.range-selector__segment {
  position: absolute;
  bottom: 0;
  height: var(--range-height);
  background-color: var(--range-bg);
  border-radius: var(--range-radius);
  transition: height 0.15s ease, background-color 0.15s ease;
}

.range-selector__segment--hover {
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

.range-selector--hovering .range-selector__filled,
.range-selector--active .range-selector__filled {
  height: var(--range-height-hover);
}

.range-selector--transform .range-selector__filled {
  width: 100%;
  transform: scaleX(0);
  will-change: transform;
}

.range-selector--transition .range-selector__filled {
  transition: width 0.1s linear, height 0.15s ease;
}

.range-selector--active .range-selector__filled {
  transition: height 0.15s ease !important;
}

.range-selector--no-transition .range-selector__filled {
  transition: none !important;
}

.range-selector__hover-filled {
  position: absolute;
  left: 0;
  bottom: 0;
  height: var(--range-height);
  background-color: var(--input);
  pointer-events: none;
}

.range-selector--hovering .range-selector__hover-filled,
.range-selector--active .range-selector__hover-filled {
  height: var(--range-height-hover);
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

.range-selector__tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  font-weight: 500;
  padding: 3px 7px;
  border-radius: 4px;
  background-color: var(--card, #111);
  color: var(--foreground, #fff);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  opacity: 1;
  transition: opacity 0.12s ease-out;
  z-index: 50;
}

.range-selector__tooltip-title {
  font-weight: 500;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.range-selector__tooltip-time {
  opacity: 0.75;
}
</style>
