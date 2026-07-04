<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
      </DialogHeader>

      <form
        class="flex flex-col gap-4"
        @submit.prevent="emit('submit')"
      >
        <Input
          v-model="localName"
          :placeholder="$t('library.folder.namePlaceholder')"
        />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            @click="isOpen = false"
          >
            {{ $t("common.cancel") }}
          </Button>
          <Button type="submit">
            {{ $t("common.save") }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const props = defineProps<{
  open: boolean;
  name: string;
  title: string;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  "update:name": [name: string];
  "submit": [];
}>();

const isOpen = computed({
  get: () => props.open,
  set: value => emit("update:open", value),
});

const localName = computed({
  get: () => props.name,
  set: value => emit("update:name", String(value)),
});
</script>
