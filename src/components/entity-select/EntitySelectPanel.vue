<template>
  <div class="relative flex h-full w-full flex-col overflow-hidden bg-card">
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
        :padding-bottom="8"
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
      </VirtualScrollable>

      <div
        v-if="showCreateRow"
        class="absolute inset-x-0 bottom-0 border-t border-border bg-card p-2"
      >
        <Item
          as="button"
          type="button"
          data-testid="create-row"
          class="w-full cursor-pointer gap-2 px-3 py-2 text-left text-primary"
          @click="emit('create', normalizedSearch)"
        >
          <IconPlus class="size-5" />
          <span class="truncate">{{ createLabel ?? t("entitySelect.create", { name: normalizedSearch }) }}</span>
        </Item>
      </div>

      <AddFloatingButton
        :count="confirmCount ?? 0"
        :show="(confirmCount ?? 0) > 0"
        @click="emit('confirm')"
      />
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import { computed, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item } from "@/components/ui/item";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import RightPanelHeader from "@/modules/right-panel/components/RightPanelHeader.vue";
import AddFloatingButton from "@/modules/tracks/components/tracks-sheet/AddFloatingButton.vue";
import IconPlus from "~icons/tabler/plus";
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
  showBack?: boolean;
}>(), {
  isLoading: false,
  itemHeight: 64,
  canCreate: false,
  createLabel: undefined,
  confirmCount: 0,
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

const listEl = useTemplateRef<HTMLElement>("listEl");
defineExpose({ listEl });

const keyAt = (index: number) => {
  const item = props.items[index];
  return item ? props.getKey(item) : index;
};

const normalizedSearch = computed(() => props.search.trim().replace(/\s+/g, " "));
const showCreateRow = computed(() => props.canCreate && normalizedSearch.value.length > 0);
</script>
