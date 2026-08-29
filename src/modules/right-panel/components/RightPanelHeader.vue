<template>
  <div class="flex min-h-16 items-center gap-2 px-4 py-3">
    <div class="flex shrink-0 items-center gap-2">
      <template
        v-for="control in resolvedLeadingControls"
        :key="`leading-${control}`"
      >
        <Button
          v-if="control === 'back'"
          size="icon-lg"
          variant="ghost"
          class="shrink-0 rounded-full"
          @click="emit('back')"
        >
          <IconChevronLeft class="size-6" />
        </Button>

        <Button
          v-else-if="control === 'close'"
          size="icon-lg"
          variant="ghost"
          class="shrink-0 rounded-full"
          @click="emit('close')"
        >
          <IconX class="size-6" />
        </Button>
      </template>

      <slot name="leading" />
    </div>

    <div class="min-w-0 flex-1">
      <h2 class="truncate text-lg font-bold">
        {{ title }}
      </h2>
      <p
        v-if="description"
        class="mt-0.5 text-xs text-muted-foreground"
      >
        {{ description }}
      </p>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <slot name="trailing" />

      <template
        v-for="control in resolvedTrailingControls"
        :key="`trailing-${control}`"
      >
        <Button
          v-if="control === 'back'"
          size="icon"
          variant="ghost"
          class="shrink-0 rounded-full"
          @click="emit('back')"
        >
          <IconChevronLeft class="size-6" />
        </Button>

        <Button
          v-else-if="control === 'close'"
          size="icon"
          variant="ghost"
          class="shrink-0 rounded-full"
          @click="emit('close')"
        >
          <IconX class="size-6" />
        </Button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import IconChevronLeft from "~icons/tabler/arrow-left";
import IconX from "~icons/tabler/x";

type HeaderControl = "back" | "close";

const props = withDefaults(defineProps<{
  title: string;
  description?: string | null;
  showBack?: boolean;
  showClose?: boolean;
  leadingControls?: HeaderControl[];
  trailingControls?: HeaderControl[];
}>(), {
  description: null,
  showBack: false,
  showClose: false,
  leadingControls: undefined,
  trailingControls: undefined,
});

const hasCustomControlLayout = computed(() => {
  return props.leadingControls !== undefined || props.trailingControls !== undefined;
});

const resolvedLeadingControls = computed<HeaderControl[]>(() => {
  if (hasCustomControlLayout.value) {
    return props.leadingControls ?? [];
  }

  return props.showBack ? ["back"] : [];
});

const resolvedTrailingControls = computed<HeaderControl[]>(() => {
  if (hasCustomControlLayout.value) {
    return props.trailingControls ?? [];
  }

  return props.showClose ? ["close"] : [];
});

const emit = defineEmits<{
  back: [];
  close: [];
}>();
</script>
