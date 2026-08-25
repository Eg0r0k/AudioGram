<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-md h-60">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-4 h-full">
        <div class="flex flex-col gap-1.5">
          <Input
            :id="fieldId"
            v-model="name"
            surface="card"
            :label="$t('library.folder.namePlaceholder')"
            :maxlength="FOLDER_NAME_MAX_LENGTH"
            :aria-invalid="!!errors.name || undefined"
            :aria-describedby="errors.name ? errorId : undefined"
            :class="{ 'border-destructive focus-visible:ring-destructive': errors.name }"
            @keydown.enter.prevent="onSubmit"
          />
          <p
            v-if="errors.name"
            :id="errorId"
            class="text-xs text-destructive"
            role="alert"
          >
            {{ errors.name }}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="destructive-link"
            @click="isOpen = false"
          >
            {{ $t("common.cancel") }}
          </Button>
          <Button
            type="button"
            variant="ghost-primary"
            :disabled="!meta.valid"
            @click="onSubmit"
          >
            {{ $t("common.save") }}
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/valibot";
import { maxLength, minLength, object, pipe, string, transform } from "valibot";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FOLDER_NAME_MAX_LENGTH, normalizeFolderName } from "@/modules/library/lib/folderName";

const props = defineProps<{
  open: boolean;
  /** What the field starts with: the current name on rename, a default on create. */
  initialName: string;
  title: string;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  /** Fires with the normalized name once it passes the rules. */
  "submit": [name: string];
}>();

const { t } = useI18n();
const fieldId = useId();
const errorId = useId();

const isOpen = computed({
  get: () => props.open,
  set: value => emit("update:open", value),
});

// The rules themselves live in folderName.ts; this schema only adds the
// messages and normalizes before measuring, so "   " is empty and padding
// does not count toward the limit.
const schema = object({
  name: pipe(
    string(),
    transform(normalizeFolderName),
    minLength(1, t("library.folder.validation.nameRequired")),
    maxLength(FOLDER_NAME_MAX_LENGTH, t("library.folder.validation.nameMaxLength", { max: FOLDER_NAME_MAX_LENGTH })),
  ),
});

const { errors, meta, defineField, handleSubmit, resetForm } = useForm({
  validationSchema: toTypedSchema(schema),
  initialValues: { name: props.initialName },
});

const [name] = defineField("name");

// Every opening starts from the caller's value with a clean slate — no
// error left over from the previous attempt.
watch(() => props.open, (open) => {
  if (open) resetForm({ values: { name: props.initialName } });
});

const onSubmit = handleSubmit((values) => {
  emit("submit", values.name);
});
</script>
