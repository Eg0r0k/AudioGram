<template>
  <div
    class="relative flex h-full w-full flex-col overflow-hidden bg-card"
    :style="keyboardInsetStyle"
  >
    <RightPanelHeader
      :title="title"
      :description="null"
      :show-back="showBack"
      @back="emit('back')"
      @close="emit('close')"
    />

    <div class="bg-card px-4 pb-2">
      <InputGroup class="flex-1 bg-background! rounded-full">
        <InputGroupInput
          :model-value="search"
          class="pl-3! text-[15px]"
          :placeholder="t('search.placeholder')"
          @keydown.stop
          @update:model-value="emit('update:search', String($event))"
        />
        <InputGroupAddon
          v-if="search.trim()"
          tabindex="-1"
          align="inline-end"
        >
          <Button
            class="rounded-full"
            variant="ghost-primary"
            size="icon-sm"
            @click="emit('update:search', '')"
          >
            <IconX class="size-5" />
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </div>

    <div
      ref="listEl"
      class="relative min-h-0 flex-1 overflow-hidden"
    >
      <VirtualScrollable
        :items="items"
        :get-item-key="keyAt"
        :item-height="itemHeight"
        :load-more-offset="160"
        :padding-bottom="8 + keyboardInset"
        :loading="isLoading"
        class="h-full"
        @load-more="emit('loadMore')"
      >
        <template #default="{ item, index }">
          <div class="px-2">
            <slot
              name="row"
              :item="item"
              :index="index"
            />
          </div>
        </template>

        <template #empty>
          <slot name="empty">
            <Empty class="p-4 py-8 md:p-4 md:py-8">
              <EmptyDescription>{{ t("common.empty") }}</EmptyDescription>
            </Empty>
          </slot>
        </template>

        <template #loader>
          <slot name="loader" />
        </template>
      </VirtualScrollable>

      <AddFloatingButton
        :count="confirmCount ?? 0"
        :show="showConfirm ?? (confirmCount ?? 0) > 0"
        @click="emit('confirm')"
      />
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import { computed, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { useKeyboardInset } from "@/composables/useKeyboardInset";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import RightPanelHeader from "@/modules/right-panel/components/RightPanelHeader.vue";
import AddFloatingButton from "@/modules/tracks/components/tracks-sheet/AddFloatingButton.vue";
import IconX from "~icons/tabler/x";

const props = withDefaults(defineProps<{
  title: string;
  items: T[];
  getKey: (item: T) => string;
  search: string;
  isLoading?: boolean;
  itemHeight?: number;
  canCreate?: boolean;
  createLabel?: string;
  confirmCount?: number;
  /** Overrides the "count > 0" rule for pickers whose pending change is not a count (a single album, a detach). */
  showConfirm?: boolean;
  showBack?: boolean;
}>(), {
  isLoading: false,
  itemHeight: 64,
  canCreate: false,
  createLabel: undefined,
  confirmCount: 0,
  showConfirm: undefined,
  showBack: true,
});

const emit = defineEmits<{
  "update:search": [value: string];
  "confirm": [];
  "create": [name: string];
  "loadMore": [];
  "back": [];
  "close": [];
}>();

const { t } = useI18n();

// Searching opens the keyboard; on WebViews that ignore resizes-content the
// confirm button and the list tail would sit behind it. Same pattern as
// EditTrackPanel: the measured overlap feeds --keyboard-inset, which the
// floating button's bottom calc consumes.
const { keyboardInset } = useKeyboardInset();
const keyboardInsetStyle = computed(() => ({ "--keyboard-inset": `${keyboardInset.value}px` }));

const listEl = useTemplateRef<HTMLElement>("listEl");
defineExpose({ listEl });

const keyAt = (index: number) => {
  const item = props.items[index];
  return item ? props.getKey(item) : index;
};

</script>
