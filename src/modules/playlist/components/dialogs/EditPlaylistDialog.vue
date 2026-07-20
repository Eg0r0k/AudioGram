<template>
  <EditEntityDialog
    :open="open"
    :has-entity="!!playlist"
    :title="$t('dialogs.editPlaylist.title')"
    cover-alt="Playlist cover preview"
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
import type { PlaylistEntity } from "@/db/entities";
import EditEntityDialog from "@/components/dialogs/EditEntityDialog.vue";
import type {
  EditEntityCoverErrorMessages,
  EditEntityFieldConfig,
  EditEntitySubmitPayload,
} from "@/components/dialogs/editEntityDialog";
import type { PlaylistChanges } from "../../composables/usePlaylistPage";

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 300;

const { t } = useI18n();

const props = defineProps<{
  open: boolean;
  playlist: PlaylistEntity | null;
  currentCoverUrl?: string | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "save": [changes: PlaylistChanges];
}>();

const initialPrimary = computed(() => props.playlist?.name ?? "");
const initialSecondary = computed(() => props.playlist?.description ?? "");

const primaryField = computed<EditEntityFieldConfig>(() => ({
  id: "playlist-name",
  label: t("dialogs.editPlaylist.playlistName"),
  placeholder: t("dialogs.editPlaylist.namePlaceholder"),
  maxLength: MAX_NAME_LENGTH,
  maxLengthMessage: t("dialogs.editPlaylist.validation.nameMaxLength", { max: MAX_NAME_LENGTH }),
  requiredMessage: t("dialogs.editPlaylist.validation.nameRequired"),
}));

const secondaryField = computed<EditEntityFieldConfig>(() => ({
  id: "playlist-description",
  label: t("dialogs.editPlaylist.description"),
  placeholder: t("dialogs.editPlaylist.descriptionPlaceholder"),
  maxLength: MAX_DESCRIPTION_LENGTH,
  maxLengthMessage: t("dialogs.editPlaylist.validation.descriptionMaxLength", { max: MAX_DESCRIPTION_LENGTH }),
}));

const coverErrorMessages = computed<EditEntityCoverErrorMessages>(() => ({
  invalidFormat: t("dialogs.editPlaylist.errors.invalidFormat"),
  readError: t("dialogs.editPlaylist.errors.readError"),
  unknown: t("dialogs.editPlaylist.errors.unknown"),
}));

function onSubmit(payload: EditEntitySubmitPayload): void {
  if (!props.playlist) return;

  const changes: PlaylistChanges = {};

  const name = payload.primary.trim();
  if (name && name !== props.playlist.name) changes.name = name;

  const description = payload.secondary.trim();
  if (description !== (props.playlist.description ?? "")) changes.description = description;

  if (payload.cover.coverBlob) changes.coverBlob = payload.cover.coverBlob;
  else if (payload.cover.removeCover) changes.removeCover = true;

  emit("save", changes);
}
</script>
