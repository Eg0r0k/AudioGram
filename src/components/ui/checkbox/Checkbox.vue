<script setup lang="ts">
import type { CheckboxRootEmits, CheckboxRootProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { cva, type VariantProps } from "class-variance-authority";
import { Check } from "lucide-vue-next";
import { CheckboxIndicator, CheckboxRoot, useForwardPropsEmits } from "reka-ui";
import { cn } from "@/lib/utils";

const checkboxVariants = cva(
  "checkbox-animated peer relative cursor-pointer overflow-hidden border-2 border-input data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive shrink-0 outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "size-3.5 rounded-[3px] [&_svg]:!size-2.5",
        default: "size-4 rounded-[4px] [&_svg]:!size-3",
        lg: "size-5 rounded-[5px] [&_svg]:!size-3.5",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

type CheckboxVariants = VariantProps<typeof checkboxVariants>;

const props = defineProps<
  CheckboxRootProps & {
    class?: HTMLAttributes["class"];
    size?: CheckboxVariants["size"];
  }
>();
const emits = defineEmits<CheckboxRootEmits>();

const delegatedProps = reactiveOmit(props, "class", "size");
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <CheckboxRoot
    v-slot="slotProps"
    data-slot="checkbox"
    v-bind="forwarded"
    :class="cn(checkboxVariants({ size }), props.class)"
  >
    <span class="checkbox-bg" />

    <CheckboxIndicator
      as-child
      force-mount
      data-slot="checkbox-indicator"
    >
      <span class="checkbox-icon">
        <slot v-bind="slotProps">
          <Check stroke-width="3" />
        </slot>
      </span>
    </CheckboxIndicator>
  </CheckboxRoot>
</template>

<style>
.checkbox-bg {
  position: absolute;
  inset: -15%;
  background-color: var(--primary);
  border-radius: 50%;
  transform: scale(0);
  opacity: 0;
  transition:
    transform 0.2s var(--ease-standard),
    opacity 0.15s ease-out;
  pointer-events: none;
}

.checkbox-icon {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: grid;
  place-content: center;
  color: currentColor;
  opacity: 0;
  transform: scale(0.5);
  transition:
    opacity 0.15s ease-out,
    transform 0.2s var(--ease-bounce);
}

@supports (-webkit-touch-callout: none) {
  .checkbox-animated {
    -webkit-mask-image: -webkit-radial-gradient(circle, white 100%, black 100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .checkbox-bg,
  .checkbox-icon,
  .checkbox-animated[data-state="checked"] .checkbox-bg,
  .checkbox-animated[data-state="indeterminate"] .checkbox-bg,
  .checkbox-animated[data-state="checked"] .checkbox-icon,
  .checkbox-animated[data-state="indeterminate"] .checkbox-icon,
  .checkbox-animated[data-state="unchecked"] .checkbox-bg,
  .checkbox-animated[data-state="unchecked"] .checkbox-icon {
    transition: none;
  }
}

.checkbox-animated[data-state="checked"] .checkbox-bg,
.checkbox-animated[data-state="indeterminate"] .checkbox-bg {
  transform: scale(1);
  opacity: 1;
  transition:
    transform 0.25s var(--ease-bounce),
    opacity 0.1s ease-out;
}

.checkbox-animated[data-state="checked"] .checkbox-icon,
.checkbox-animated[data-state="indeterminate"] .checkbox-icon {
  opacity: 1;
  transform: scale(1);
  transition:
    opacity 0.1s 0.1s ease-out,
    transform 0.25s 0.05s var(--ease-bounce);
}

.checkbox-animated[data-state="unchecked"] .checkbox-bg {
  transform: scale(0);
  opacity: 0;
  transition:
    transform 0.2s 0.05s var(--ease-standard),
    opacity 0.15s 0.1s ease-out;
}

.checkbox-animated[data-state="unchecked"] .checkbox-icon {
  opacity: 0;
  transform: scale(0.5);
  transition:
    opacity 0.1s ease-out,
    transform 0.15s var(--ease-standard);
}
</style>
