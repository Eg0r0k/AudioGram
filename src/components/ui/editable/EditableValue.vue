<template>
  <div
    :class="['inline-flex items-center justify-center', rootClass]"
  >
    <span
      v-if="!isEditing"
      role="button"
      tabindex="0"
      :class="[
        'cursor-pointer select-none rounded px-1 transition-colors',
        'hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-primary',
        displayClass
      ]"
      :title="computedEditHint"
      @dblclick="startEdit"
      @keydown.enter="startEdit"
      @keydown.space.prevent="startEdit"
    >
      {{ formattedValue }}{{ suffix }}
    </span>

    <input
      v-else
      ref="inputRef"
      v-model="inputValue"
      :type="inputType"
      :min="type === 'number' ? min : undefined"
      :max="type === 'number' ? max : undefined"
      :step="type === 'number' ? step : undefined"
      :size="type === 'text' ? Math.max(1, inputValue.length) : undefined"
      :maxlength="type === 'text' ? maxLength : undefined"
      :aria-label="computedAriaLabel"
      :aria-invalid="isInvalid || undefined"
      :class="[
        'bg-background border rounded px-1 text-center',
        'field-sizing-content max-w-full min-w-0',
        'focus:outline-none focus:ring-1',
        isInvalid
          ? 'border-destructive focus:ring-destructive'
          : 'border-primary focus:ring-primary',
        type === 'number' && '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
        inputClass
      ]"
      @blur="onBlur"
      @keydown.enter="commitEdit"
      @keydown.escape="cancelEdit"
      @keydown.up.prevent="type === 'number' && increment"
      @keydown.down.prevent="type === 'number' && decrement"
    >
  </div>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ref, computed, nextTick, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = withDefaults(defineProps<{
  modelValue: number | string;
  type?: "number" | "text";
  min?: number;
  max?: number;
  step?: number;
  showSign?: boolean;
  suffix?: string;
  /** Text mode only: hard cap on what can be typed. */
  maxLength?: number;
  /**
   * Text mode only: a value it rejects is not committed — Enter keeps the
   * field open with a red border, leaving it reverts to the stored value.
   */
  validate?: (value: string) => boolean;
  editHint?: string;
  ariaLabel?: string;
  rootClass?: HTMLAttributes["class"];
  displayClass?: HTMLAttributes["class"];
  inputClass?: HTMLAttributes["class"];
}>(), {
  type: "number",
  min: -Infinity,
  max: Infinity,
  step: 1,
  showSign: true,
  suffix: "",
  maxLength: undefined,
  validate: undefined,
  editHint: undefined,
  ariaLabel: undefined,
  rootClass: "",
  displayClass: "",
  inputClass: "",
});

const emit = defineEmits<{
  "update:modelValue": [value: number | string];
  "change": [value: number | string];
}>();

const computedEditHint = computed(() =>
  props.editHint ?? t("common.editHint"),
);

const computedAriaLabel = computed(() =>
  props.ariaLabel ?? t("common.editLabel"),
);

const inputRef = useTemplateRef("inputRef");
const isEditing = ref(false);
const inputValue = ref("");
const isInvalid = ref(false);

// Typing again clears the rejection; the next commit re-validates.
watch(inputValue, () => {
  isInvalid.value = false;
});

const isRejected = () =>
  props.type === "text" && props.validate !== undefined && !props.validate(inputValue.value);

const inputType = computed(() => props.type === "number" ? "number" : "text");

// The input sizes to its text: `field-sizing: content` where the engine has
// it (Chromium — WebView2, Android), the `size` attribute bound to the text
// length elsewhere (WebKitGTK). An explicit width in `inputClass` still wins
// over both, and `max-w-full` keeps a long value inside the parent.

const formattedValue = computed(() => {
  if (props.type === "text") {
    return String(props.modelValue);
  }
  const val = Math.round(props.modelValue as number);
  if (props.showSign && val > 0) {
    return `+${val}`;
  }
  return String(val);
});

const startEdit = () => {
  if (props.type === "text") {
    inputValue.value = String(props.modelValue);
  }
  else {
    inputValue.value = String(Math.round(props.modelValue as number));
  }
  isEditing.value = true;
  isInvalid.value = false;

  nextTick(() => {
    inputRef.value?.focus();
    inputRef.value?.select();
  });
};

const commitEdit = () => {
  // Enter commits and unmounts the input, whose blur then lands here again
  // — the second call must be a no-op or every change fires twice.
  if (!isEditing.value) return;
  if (isRejected()) {
    isInvalid.value = true;
    return;
  }

  if (props.type === "text") {
    if (inputValue.value !== props.modelValue) {
      emit("update:modelValue", inputValue.value);
      emit("change", inputValue.value);
    }
  }
  else {
    const parsed = parseFloat(inputValue.value);

    if (!Number.isNaN(parsed)) {
      const clamped = Math.max(props.min, Math.min(props.max, parsed));
      const rounded = Math.round(clamped / props.step) * props.step;

      if (rounded !== props.modelValue) {
        emit("update:modelValue", rounded);
        emit("change", rounded);
      }
    }
  }

  isEditing.value = false;
};

const cancelEdit = () => {
  isEditing.value = false;
  isInvalid.value = false;
};

// Leaving the field with a rejected value cannot keep it open (nothing
// would ever close it), so it reverts to the stored value instead.
const onBlur = () => {
  if (isRejected()) {
    cancelEdit();
    return;
  }
  commitEdit();
};

const increment = () => {
  const current = parseFloat(inputValue.value) || 0;
  const newValue = Math.min(props.max, current + props.step);
  inputValue.value = String(newValue);
};

const decrement = () => {
  const current = parseFloat(inputValue.value) || 0;
  const newValue = Math.max(props.min, current - props.step);
  inputValue.value = String(newValue);
};
</script>
