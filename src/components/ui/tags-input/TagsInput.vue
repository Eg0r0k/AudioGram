<script setup lang="ts">
import { computed, useId } from "vue";
import type { TagsInputRootEmits, TagsInputRootProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { TagsInputRoot, useForwardPropsEmits } from "reka-ui";
import { cn } from "@/lib/utils";
import { tagsInputVariants } from "./index";

const props = defineProps<TagsInputRootProps & {
  label?: string;
  surface?: "background" | "card" | "popover" | "muted";
  id?: string;
  class?: HTMLAttributes["class"];
}>();

const emits = defineEmits<TagsInputRootEmits>();

const delegatedProps = reactiveOmit(props, "class", "label", "surface", "id");
const forwarded = useForwardPropsEmits(delegatedProps, emits);

const generatedId = useId();
const inputId = computed(() => props.id ?? generatedId);
</script>

<template>
  <div class="relative w-full">
    <TagsInputRoot
      :id="inputId"
      v-slot="slotProps"
      v-bind="forwarded"
      :class="
        cn(
          tagsInputVariants({ surface, hasLabel: !!label }),
          props.class,
        )
      "
    >
      <slot v-bind="slotProps" />
    </TagsInputRoot>
    <!-- eslint-disable vuejs-accessibility/label-has-for -->
    <label
      v-if="label"
      :for="inputId"
      :class="
        cn(
          'absolute left-3 top-0 -translate-y-1/2 px-1 text-xs font-medium pointer-events-none transition-all duration-200 z-10',
          {
            'bg-background': (surface ?? 'background') === 'background',
            'bg-card': surface === 'card',
            'bg-popover': surface === 'popover',
            'bg-muted': surface === 'muted',
          },
          'text-muted-foreground',
          'peer-hover:text-primary',
          'peer-focus-within:text-primary',
          'peer-aria-invalid:text-destructive',
        )
      "
    >
      {{ label }}
    </label>
  </div>
</template>
