<template>
  <template v-if="artistIds.length === 1">
    <component
      :is="Item"
      @click="emit('goToArtist', artistIds[0])"
    >
      <IconUser
        class="size-5.5"
      />
      {{ $t('track.contextMenu.goToArtist') }}
    </component>
  </template>

  <template v-else-if="artistIds.length > 1">
    <component
      :is="Sub"
      @update:open="onSubOpenChange"
    >
      <component :is="SubTrigger">
        <IconUsers
          class="size-5.5"
        />
        {{ $t('track.contextMenu.goToArtists') }}
      </component>

      <component
        :is="SubContent"
        class="w-48"
      >
        <template v-if="isLoading">
          <div class="flex items-center justify-center py-3">
            <IconLoader2 class="size-4 animate-spin text-muted-foreground" />
          </div>
        </template>
        <template v-else>
          <component
            :is="Item"
            v-for="artist in artists"
            :key="artist.id"
            @click="emit('goToArtist', artist.id)"
          >
            {{ artist.name }}
          </component>
        </template>
      </component>
    </component>
  </template>

  <component
    :is="Item"
    @click="emit('goToAlbum')"
  >
    <IconDisc
      class="size-5.5"
    />
    {{ $t('track.contextMenu.goToAlbum') }}
  </component>
</template>

<script setup lang="ts">
import { shallowRef, watch } from "vue";
import { useTrackMenuComponents } from "../useTrackMenuComponents";
import IconDisc from "~icons/tabler/disc";
import IconUser from "~icons/tabler/user";
import IconUsers from "~icons/tabler/users";
import IconLoader2 from "~icons/tabler/loader-2";
import type { ArtistId } from "@/types/ids";
import type { ArtistEntity } from "@/db/entities";
import { db } from "@/db";

defineOptions({
  inheritAttrs: false,
});

// Ephemeral tracks (YouTube stream, radio) have no library identifiers —
// default to "no artists" instead of crashing the menu render.
const props = withDefaults(defineProps<{
  artistIds?: ArtistId[];
  albumName?: string;
}>(), {
  artistIds: () => [],
  albumName: "",
});

const { Item, Sub, SubTrigger, SubContent } = useTrackMenuComponents();

const artists = shallowRef<ArtistEntity[]>([]);
const isLoading = shallowRef(false);
let hasLoaded = false;

// Артисты нужны только внутри сабменю «К исполнителям» — грузим их при первом
// его открытии, а не при каждом показе меню.
async function onSubOpenChange(open: boolean) {
  if (!open || hasLoaded) return;
  hasLoaded = true;
  isLoading.value = true;

  const requestedIds = props.artistIds;
  const result = await db.artists.bulkGet(requestedIds);
  // Пока грузили, меню могли переоткрыть на другом треке — результат устарел.
  if (requestedIds !== props.artistIds) return;

  artists.value = result.filter((a): a is ArtistEntity => !!a);
  isLoading.value = false;
}

// Контент меню не размонтируется при смене трека под открытым меню —
// сбрасываем загруженное под новый набор артистов.
watch(() => props.artistIds, () => {
  hasLoaded = false;
  isLoading.value = false;
  artists.value = [];
});

const emit = defineEmits<{
  goToArtist: [artistId: ArtistId];
  goToAlbum: [];
}>();
</script>
