<template>
  <EditEntityDialog
    :open="open"
    :has-entity="!!artist"
    :title="$t('dialogs.editArtist.title')"
    cover-alt="Artist cover preview"
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
import type { ArtistEntity } from "@/db/entities";
import EditEntityDialog from "@/components/dialogs/EditEntityDialog.vue";
import type {
  EditEntityCoverErrorMessages,
  EditEntityFieldConfig,
  EditEntitySubmitPayload,
} from "@/components/dialogs/editEntityDialog";
import type { ArtistChanges } from "../../composables/useArtistPage";

const MAX_NAME_LENGTH = 100;
const MAX_BIO_LENGTH = 500;

const { t } = useI18n();

const props = defineProps<{
  open: boolean;
  artist: ArtistEntity | null;
  currentCoverUrl?: string | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "save": [changes: ArtistChanges];
}>();

const initialPrimary = computed(() => props.artist?.name ?? "");
const initialSecondary = computed(() => props.artist?.bio ?? "");

const primaryField = computed<EditEntityFieldConfig>(() => ({
  id: "artist-name",
  label: t("dialogs.editArtist.artistName"),
  placeholder: t("dialogs.editArtist.namePlaceholder"),
  maxLength: MAX_NAME_LENGTH,
  maxLengthMessage: t("dialogs.editArtist.validation.nameMaxLength", { max: MAX_NAME_LENGTH }),
  requiredMessage: t("dialogs.editArtist.validation.nameRequired"),
}));

const secondaryField = computed<EditEntityFieldConfig>(() => ({
  id: "artist-bio",
  label: t("dialogs.editArtist.bio"),
  placeholder: t("dialogs.editArtist.bioPlaceholder"),
  maxLength: MAX_BIO_LENGTH,
  maxLengthMessage: t("dialogs.editArtist.validation.bioMaxLength", { max: MAX_BIO_LENGTH }),
}));

const coverErrorMessages = computed<EditEntityCoverErrorMessages>(() => ({
  invalidFormat: t("dialogs.editArtist.errors.invalidFormat"),
  readError: t("dialogs.editArtist.errors.readError"),
  unknown: t("dialogs.editArtist.errors.unknown"),
}));

function onSubmit(payload: EditEntitySubmitPayload): void {
  if (!props.artist) return;

  const changes: ArtistChanges = {};

  const name = payload.primary.trim();
  if (name && name !== props.artist.name) changes.name = name;

  const bio = payload.secondary.trim();
  if (bio !== (props.artist.bio ?? "")) changes.bio = bio;

  if (payload.cover.coverBlob) changes.coverBlob = payload.cover.coverBlob;
  else if (payload.cover.removeCover) changes.removeCover = true;

  emit("save", changes);
}
</script>
