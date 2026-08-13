<!-- eslint-disable vuejs-accessibility/label-has-for -->
<template>
  <div class="relative flex h-full w-full flex-col overflow-hidden! bg-card">
    <RightPanelHeader
      :title="$t('track.edit.title')"
      :description="track?.title"
      show-back
      @back="handleBack"
      @close="rightPanel.close()"
    />

    <Scrollable class="min-h-0 flex-1 ">
      <form
        v-if="track"
        class="grid gap-5 px-5 pb-8 pt-2"
        @submit.prevent="onSubmit"
      >
        <div class="space-y-2 bg-card">
          <Input
            id="track-title"
            v-model="title"
            surface="card"
            :label="$t('track.edit.placeholders.title')"
            :disabled="isPending"
            :class="{ 'border-destructive focus-visible:ring-destructive': errors.title }"
            @keydown.enter.prevent="onSubmit"
          />

          <p
            v-if="errors.title"
            class="text-sm text-destructive"
          >
            {{ errors.title }}
          </p>
        </div>
        <TagsInput
          v-model="artists"
          surface="card"
          :label="$t('track.edit.fields.artists')"
        >
          <TagsInputItem
            v-for="item in artists"
            :key="item"
            :value="item"
          >
            <TagsInputItemText />
            <TagsInputItemDelete>
              +
            </TagsInputItemDelete>
          </TagsInputItem>
          <TagsInputInput />
        </TagsInput>
        <!-- <div class="space-y-2">
          <Label
            for="track-artists"
            :class="{ 'text-destructive': errors.artists }"
          >
            {{ $t('track.edit.fields.artists') }}
          </Label>

          <div class="relative">
            <div
              :class="[
                'flex min-h-11 flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 transition-colors focus-within:ring-ring/50 focus-within:ring-[3px]',
                errors.artists ? 'border-destructive focus-within:ring-destructive/30' : 'border-input',
                isPending && 'opacity-50',
              ]"
            >
              <Badge
                v-for="artistName in selectedArtists"
                :key="artistName"
                variant="secondary"
                class="gap-1 pr-1"
              >
                {{ artistName }}
                <button
                  type="button"
                  class="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                  :disabled="isPending"
                  @click="removeArtist(artistName)"
                >
                  <IconX class="size-3" />
                </button>
              </Badge>

              <input
                id="track-artists"
                v-model="artistSearch"
                type="text"
                class="min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
                :placeholder="selectedArtists.length === 0 ? $t('track.edit.placeholders.artists') : $t('track.edit.placeholders.addArtist')"
                :disabled="isPending"
                @focus="isArtistSearchOpen = true"
                @blur="handleArtistSearchBlur"
                @keydown.enter.prevent="addArtistFromSearch"
                @keydown.backspace="handleArtistBackspace"
              >
            </div>

            <div
              v-if="isArtistSearchOpen && (artistSuggestions.length > 0 || canCreateArtist)"
              class="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-lg"
            >
              <button
                v-for="artist in artistSuggestions"
                :key="artist.id"
                type="button"
                class="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
                @mousedown.prevent="addArtist(artist.name)"
              >
                <span class="truncate">{{ artist.name }}</span>
              </button>

              <button
                v-if="canCreateArtist"
                type="button"
                class="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                @mousedown.prevent="addArtistFromSearch"
              >
                <IconPlus class="size-4" />
                <span class="truncate">{{ $t('track.edit.createArtist', { name: normalizedArtistSearch }) }}</span>
              </button>
            </div>
          </div>

          <p class="text-xs text-muted-foreground">
            {{ $t('track.edit.artistsHelp') }}
          </p>

          <p
            v-if="errors.artists"
            class="text-sm text-destructive"
          >
            {{ errors.artists }}
          </p>
        </div> -->

        <div class="space-y-2">
          <div class="relative">
            <Input
              id="track-album"
              v-model="albumSearch"
              surface="card"
              :label="$t('track.edit.fields.album')"
              :disabled="isPending"
              :class="{ 'border-destructive focus-visible:ring-destructive': errors.albumId }"
              @focus="isAlbumSearchOpen = true"
              @blur="handleAlbumSearchBlur"
            />

            <p
              v-if="selectedAlbumName"
              class="mt-2 flex items-center gap-2 text-xs text-muted-foreground"
            >
              <IconDisc class="size-4" />
              <span class="truncate">{{ $t('track.edit.selectedAlbum', { title: selectedAlbumName }) }}</span>
            </p>

            <div
              v-if="isAlbumSearchOpen && albumSuggestions.length > 0"
              class="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-lg"
            >
              <button
                v-for="album in albumSuggestions"
                :key="album.id"
                type="button"
                class="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
                @mousedown.prevent="selectAlbum(album.id, album.title)"
              >
                <IconDisc class="size-4 text-muted-foreground" />
                <span class="truncate">{{ album.title }}</span>
              </button>
            </div>
          </div>

          <p
            v-if="errors.albumId"
            class="text-sm text-destructive"
          >
            {{ errors.albumId }}
          </p>
        </div>
      </form>

      <p
        v-else
        class="px-5 py-8 text-center text-sm text-muted-foreground"
      >
        {{ $t('track.edit.libraryOnly') }}
      </p>
    </Scrollable>
    <FloatingActionButton
      :show="hasChanges"
    >
      <Button
        class="size-12 rounded-full shadow-lg"
        :disabled="!track || isPending || !meta.valid || !hasChanges"
        @click="onSubmit"
      >
        <IconSave class="size-6" />
      </Button>
    </FloatingActionButton>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/valibot";
import { array, maxLength, minLength, object, pipe, string } from "valibot";
import type { InferOutput } from "valibot";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Scrollable } from "@/components/ui/scrollable";
import { isLibraryTrack, type Track } from "@/modules/player/types";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import type { RightPanelEditTrackPayload } from "@/modules/right-panel/types";
import { searchAlbums } from "@/queries/album.queries";
import { queryKeys } from "@/queries/query-keys";
import { updateTrackMetadataAndSync } from "@/queries/track.queries";
import type { AlbumId } from "@/types/ids";
import RightPanelHeader from "../RightPanelHeader.vue";
import IconDisc from "~icons/tabler/disc";
import IconSave from "~icons/tabler/device-floppy";
import FloatingActionButton from "@/components/common/FloatingActionButton.vue";
import { TagsInput, TagsInputInput, TagsInputItem, TagsInputItemDelete, TagsInputItemText } from "@/components/ui/tags-input";

const MAX_TITLE_LENGTH = 120;
const MAX_ARTISTS_LENGTH = 240;

const props = defineProps<{
  payload: RightPanelEditTrackPayload;
}>();

const { t } = useI18n();
const queryClient = useQueryClient();
const queueStore = useQueueStore();
const rightPanel = useRightPanelStore();

const trackFormSchema = object({
  title: pipe(
    string(),
    minLength(1, t("track.edit.validation.titleRequired")),
    maxLength(MAX_TITLE_LENGTH, t("track.edit.validation.titleMaxLength", { max: MAX_TITLE_LENGTH })),
  ),
  artists: pipe(
    array(pipe(
      string(),
      maxLength(MAX_ARTISTS_LENGTH, t("track.edit.validation.artistMaxLength", { max: MAX_ARTISTS_LENGTH })),
    )),
    minLength(1, t("track.edit.validation.artistsRequired")),
  ),
  albumId: pipe(
    string(),
    minLength(1, t("track.edit.validation.albumRequired")),
  ),
});
type TrackFormValues = InferOutput<typeof trackFormSchema>;

const { errors, meta, defineField, handleSubmit, resetForm, setValues } = useForm<TrackFormValues>({
  validationSchema: toTypedSchema(trackFormSchema),
  initialValues: {
    title: "",
    artists: [],
    albumId: "",
  },
});

const [title] = defineField("title");
const [artists] = defineField("artists");
const [albumId] = defineField("albumId");
const track = computed<Track | null>(() => {
  return isLibraryTrack(props.payload.track) ? props.payload.track : null;
});

const artistSearch = ref("");
const albumSearch = ref("");
const selectedAlbumName = ref("");
const isAlbumSearchOpen = ref(false);
const selectedArtists = computed(() => artists.value ?? []);
const normalizedAlbumSearch = computed(() => albumSearch.value.trim().replace(/\s+/g, " "));

const { data: albumSearchResults } = useQuery({
  queryKey: computed(() => queryKeys.albums.search(normalizedAlbumSearch.value)),
  queryFn: computed(() => isAlbumSearchOpen.value
    ? () => searchAlbums(normalizedAlbumSearch.value)
    : skipToken),
});

const albumSuggestions = computed(() => {
  return (albumSearchResults.value ?? [])
    .filter(album => album.id !== albumId.value)
    .slice(0, 6);
});

const hasChanges = computed(() => {
  if (!track.value) return false;

  return (title.value?.trim() ?? "") !== track.value.title
    || selectedArtists.value.join("\n") !== parseArtists(track.value.artist).join("\n")
    || albumId.value !== track.value.albumId;
});

const { mutateAsync: updateTrack, isPending } = useMutation({
  mutationFn: (values: TrackFormValues) => {
    if (!track.value) {
      throw new Error("Track is not editable");
    }

    return updateTrackMetadataAndSync(queryClient, track.value, {
      title: values.title,
      artistNames: values.artists,
      albumId: values.albumId as AlbumId,
    });
  },
  onError: () => {
    toast.error(t("track.edit.saveFailed"));
  },
});

watch(
  track,
  (nextTrack) => {
    if (!nextTrack) {
      resetForm();
      return;
    }

    setValues({
      title: nextTrack.title,
      artists: parseArtists(nextTrack.artist),
      albumId: nextTrack.albumId,
    });
    artistSearch.value = "";
    albumSearch.value = nextTrack.albumName;
    selectedAlbumName.value = nextTrack.albumName;
  },
  { immediate: true },
);

const onSubmit = handleSubmit(async (values) => {
  if (!track.value || !hasChanges.value) return;

  const nextTrack = await updateTrack(values);
  queueStore.syncTrackMetadata(nextTrack);
  toast.success(t("track.edit.saved"));
  rightPanel.openTrackInfo({ track: nextTrack }, { depth: 1 });
});

function parseArtists(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of value.split(",")) {
    const name = part.trim().replace(/\s+/g, " ");
    const key = name.toLowerCase();

    if (!name || seen.has(key)) continue;

    seen.add(key);
    result.push(name);
  }

  return result;
}

function selectAlbum(nextAlbumId: AlbumId, title: string): void {
  albumId.value = nextAlbumId;
  albumSearch.value = title;
  selectedAlbumName.value = title;
  isAlbumSearchOpen.value = false;
}

function handleAlbumSearchBlur(): void {
  window.setTimeout(() => {
    isAlbumSearchOpen.value = false;
    albumSearch.value = selectedAlbumName.value;
  }, 100);
}

function handleBack(): void {
  rightPanel.openTrackInfo({ track: props.payload.track }, { depth: 1 });
}
</script>
