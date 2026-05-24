<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { useVModel } from "@vueuse/core";
import { cn } from "@/lib/utils";

const props = withDefaults(defineProps<{
  defaultValue?: string | number;
  modelValue?: string | number;
  type?: "text" | "email" | "tel" | "url" | "number" | "password" | "search" | "date" | "time" | "datetime-local" | "month" | "week" | "color";
  name?: string;
  autocomplete?: string;
  spellcheck?: boolean | "true" | "false";
  inputmode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  class?: HTMLAttributes["class"];
}>(), {
  type: "text",
});

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void;
}>();

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
});
</script>
<!-- eslint-disable vuejs-accessibility/form-control-has-label -->
<template>
  <input
    v-model="modelValue"
    :type="type"
    :name="name"
    :autocomplete="autocomplete"
    :spellcheck="spellcheck"
    :inputmode="inputmode"
    data-slot="input"
    :class="
      cn(
        'audiogram-input',
        'file:text-foreground placeholder:font-medium placeholder:text-muted-foreground selection:bg-primary caret-primary selection:text-primary-foreground dark:bg-background h-9 w-full min-w-0 rounded-md bg-transparent px-3 py-1 text-base  outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium  disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        props.class
      )
    "
  >
</template>

<style scoped>
.audiogram-input {
  border: 1px solid var(--border);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.audiogram-input:hover:not(:focus):not(:disabled):not([aria-invalid="true"]) {
  border-color: var(--primary);
}

.audiogram-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}

.audiogram-input[aria-invalid="true"] {
  border-color: var(--destructive);
}

.audiogram-input[aria-invalid="true"]:focus {
  box-shadow: 0 0 0 1px var(--destructive);
}
</style>
