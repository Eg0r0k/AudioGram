<script setup lang="ts">
import { computed, ref, useId } from "vue";
import type { HTMLAttributes } from "vue";
import { useVModel } from "@vueuse/core";
import { cn } from "@/lib/utils";
import { inputVariants } from "./index";

type Surface = "background" | "card" | "popover" | "muted";

const props = withDefaults(defineProps<{
  label?: string;
  surface?: Surface;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  defaultValue?: string | number;
  modelValue?: string | number;

  type?:
    | "text"
    | "email"
    | "tel"
    | "url"
    | "number"
    | "password"
    | "search"
    | "date"
    | "time"
    | "datetime-local"
    | "month"
    | "week"
    | "color";

  name?: string;
  autocomplete?: string;
  spellcheck?: boolean | "true" | "false";

  inputmode?:
    | "none"
    | "text"
    | "tel"
    | "url"
    | "email"
    | "numeric"
    | "decimal"
    | "search";

  class?: HTMLAttributes["class"];
}>(), {
  type: "text",
  surface: "background",
});
const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void;
}>();

const generatedId = useId();
const inputId = computed(() => props.id ?? generatedId);

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
});

const isFocused = ref(false);

const isActive = computed(() => {
  if (!props.label) return false;
  return isFocused.value || !!modelValue.value;
});
</script>

<template>
  <div class="relative w-full">
    <input
      :id="inputId"
      v-model="modelValue"
      :type="type"
      :name="name"
      :autocomplete="autocomplete"
      :spellcheck="spellcheck"
      :inputmode="inputmode"
      :placeholder="placeholder"
      :aria-label="!label ? ariaLabel : undefined"
      :class="
        cn(
          inputVariants({
            surface,
            hasLabel: !!label,
          }),
          props.class
        )
      "
      @focus="isFocused = true"
      @blur="isFocused = false"
    >
    <!-- eslint-disable vuejs-accessibility/label-has-for -->
    <label
      v-if="label"
      :for="inputId"
      :class="
        cn(
          'absolute left-3 top-1/2 -translate-y-1/2 px-1 text-sm font-medium pointer-events-none transition-[top,translate,font-size,color] duration-200',
          {
            'bg-background': surface === 'background',
            'bg-card': surface === 'card',
            'bg-popover': surface === 'popover',
            'bg-muted': surface === 'muted',
          },
          'text-muted-foreground',

          'peer-hover:text-primary',
          'peer-focus:text-primary',
          'peer-aria-invalid:text-destructive',

          isActive && 'top-0 -translate-y-1/2 text-xs'
        )
      "
    >
      {{ label }}
    </label>
  </div>
</template>
