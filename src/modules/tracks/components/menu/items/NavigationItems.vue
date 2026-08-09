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
    <component :is="Sub">
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
import { ref, onMounted } from "vue";
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

const artists = ref<ArtistEntity[]>([]);
const isLoading = ref(true);

onMounted(async () => {
  if (props.artistIds.length === 0) {
    isLoading.value = false;
    return;
  }
  const result = await db.artists.bulkGet(props.artistIds);
  artists.value = result.filter((a): a is ArtistEntity => !!a);
  isLoading.value = false;
});

const emit = defineEmits<{
  goToArtist: [artistId: ArtistId];
  goToAlbum: [];
}>();
</script>
