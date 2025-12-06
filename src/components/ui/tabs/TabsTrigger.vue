<script setup lang="ts">
import type { TabsTriggerProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { TabsTrigger, useForwardProps } from "reka-ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const props = defineProps<
  TabsTriggerProps & {
    class?: HTMLAttributes["class"];
  }
>();

const delegatedProps = reactiveOmit(props, "class");
const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <TabsTrigger data-slot="tabs-trigger" v-bind="forwardedProps" as-child>
    <Button
      variant="ghost"
      :class="
        cn(
          'relative rounded-b-none h-10 px-4',
          'text-muted-foreground hover:text-foreground',
          'data-[state=active]:text-primary',
          'hover:bg-transparent',
          'transition-colors duration-200',
          props.class
        )
      "
    >
      <slot />
    </Button>
  </TabsTrigger>
</template>
