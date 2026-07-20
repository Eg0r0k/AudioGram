<template>
  <EditEntityDialog
    :open="open"
    :has-entity="!!album"
    :title="$t('dialogs.editAlbum.title')"
    cover-alt="Album cover preview"
    :current-cover-url="currentCoverUrl"
    :primary-field="primaryField"
    :secondary-field="secondaryField"
    :initial-primary="initialPrimary"
    :initial-secondary="initialSecondary"
    :cover-error-messages="coverErrorMessages"
    @update:open="emit('update:open', $event)"
    @submit="onSubmit"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { AlbumEntity } from "@/db/entities";
import EditEntityDialog from "@/components/dialogs/EditEntityDialog.vue";
import type {
  EditEntityCoverErrorMessages,
  EditEntityFieldConfig,
  EditEntitySubmitPayload,
} from "@/components/dialogs/editEntityDialog";
import type { AlbumChanges } from "../../composables/useAlbumPage";

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 200;

const { t } = useI18n();

const props = defineProps<{
  open: boolean;
  album: AlbumEntity | null;
  currentCoverUrl?: string | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "save": [changes: AlbumChanges];
}>();

const initialPrimary = computed(() => props.album?.title ?? "");
// AlbumEntity has no persisted description, so it always starts empty.
const initialSecondary = "";

const primaryField = computed<EditEntityFieldConfig>(() => ({
  id: "album-title",
  label: t("dialogs.editAlbum.albumTitle"),
  placeholder: t("dialogs.editAlbum.titlePlaceholder"),
  maxLength: MAX_TITLE_LENGTH,
  maxLengthMessage: t("dialogs.editAlbum.validation.titleMaxLength", { max: MAX_TITLE_LENGTH }),
  requiredMessage: t("dialogs.editAlbum.validation.titleRequired"),
}));

const secondaryField = computed<EditEntityFieldConfig>(() => ({
  id: "album-description",
  label: t("dialogs.editAlbum.description"),
  placeholder: t("dialogs.editAlbum.descriptionPlaceholder"),
  maxLength: MAX_DESCRIPTION_LENGTH,
  maxLengthMessage: t("dialogs.editAlbum.validation.descriptionMaxLength", { max: MAX_DESCRIPTION_LENGTH }),
}));

const coverErrorMessages = computed<EditEntityCoverErrorMessages>(() => ({
  invalidFormat: t("dialogs.editAlbum.errors.invalidFormat"),
  readError: t("dialogs.editAlbum.errors.readError"),
  unknown: t("dialogs.editAlbum.errors.unknown"),
}));

function onSubmit(payload: EditEntitySubmitPayload): void {
  if (!props.album) return;

  const changes: AlbumChanges = {};

  const title = payload.primary.trim();
  if (title && title !== props.album.title) changes.title = title;

  const description = payload.secondary.trim();
  if (description) changes.description = description;

  if (payload.cover.coverBlob) changes.coverBlob = payload.cover.coverBlob;
  else if (payload.cover.removeCover) changes.removeCover = true;

  emit("save", changes);
}
</script>
