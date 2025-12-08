<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { reactiveOmit } from "@vueuse/core";
import { Button } from "@/components/ui/button";
import { X } from "lucide-vue-next";
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  useForwardPropsEmits,
} from "reka-ui";
import { cn } from "@/lib/utils";
import DialogOverlay from "./DialogOverlay.vue";

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<
    DialogContentProps & {
      class?: HTMLAttributes["class"];
      showCloseButton?: boolean;
    }
  >(),
  {
    showCloseButton: true,
  },
);
const emits = defineEmits<DialogContentEmits>();

const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <DialogPortal>
    <DialogOverlay />
    <DialogContent
      data-slot="dialog-content"
      v-bind="forwarded"
      :class="
        cn(
          'bg-card fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg  p-4  sm:max-w-lg',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 ',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'duration-125',
          props.class
        )
      "
    >
      <slot />

      <DialogClose
        v-if="showCloseButton"
        as-child
      >
        <Button
          variant="ghost"
          size="icon-lg"
          class="absolute rounded-full top-2 right-2 size-8 opacity-80 hover:opacity-100"
        >
          <X class="size-6" />
          <span class="sr-only">
            {{ $t("common.close") }}
          </span>
        </Button>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
