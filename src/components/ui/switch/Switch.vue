<script setup lang="ts">
import type { SwitchRootEmits, SwitchRootProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import {
  SwitchRoot,
  SwitchThumb,
  useForwardPropsEmits,
} from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<SwitchRootProps & { class?: HTMLAttributes["class"] }>();

const emits = defineEmits<SwitchRootEmits>();

const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <SwitchRoot
    v-slot="slotProps"
    data-slot="switch"
    v-bind="forwarded"
    :class="cn(
      'switch-root',
      'peer cursor-pointer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-4 w-8 shrink-0 items-center rounded-full border-none transition-[background-color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
      props.class,
    )"
  >
    <SwitchThumb
      data-slot="switch-thumb"
      :class="cn(
        'switch-thumb',
        'bg-background pointer-events-none block size-4 rounded-full'
      )"
    >
      <slot
        name="thumb"
        v-bind="slotProps"
      />
    </SwitchThumb>
  </SwitchRoot>
</template>

<style scoped>
.switch-root {
  position: relative;
  overflow: visible;
}

.switch-thumb {
  position: absolute;
  top: 50%;
  left: 0;
  box-shadow: 0 0 0 2px var(--input);
  transition:
    transform 0.2s var(--ease-standard),
    box-shadow 0.2s var(--ease-standard);
}

.switch-root[data-state="unchecked"] .switch-thumb {
  transform: translateX(-2px) translateY(-50%);
  box-shadow: 0 0 0 2px var(--input);
}

.switch-root[data-state="checked"] .switch-thumb {
  transform: translateX(18px) translateY(-50%);
  box-shadow: 0 0 0 2px var(--primary);
}
</style>
