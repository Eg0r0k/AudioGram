<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        class="rounded-full text-white"
        size="icon-lg"
        variant="ghost"
      >
        <IconDots
          class="size-5"
        />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      class="w-60"
      align="start"
    >
      <component
        :is="contextComponent"
        v-bind="contextProps"
      />
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import Button from "@/components/ui/button/Button.vue";
import { computed, type Component } from "vue";
import { useMediaContext } from "@/modules/media-hero/composables/useMediaContext";
import { MediaContext } from "../types";
import AlbumContext from "../contexts/AlbumContext.vue";
import ArtistContext from "../contexts/ArtistContext.vue";
import IconDots from "~icons/tabler/dots";
import PlaylistContext from "../contexts/PlaylistContext.vue";
import { dropdownMenuComponents, provideMenuComponents } from "@/modules/media-hero/composables/useMenuComponents";
import LikedContext from "../contexts/LikedContext.vue";

provideMenuComponents(dropdownMenuComponents);

interface Props {
  context?: MediaContext;
  isPlaylistOwner?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  context: "album",
});

const contexts: Record<MediaContext, Component> = {
  "album": AlbumContext,
  "artist-page": ArtistContext,
  "liked": LikedContext,
  "playlist": PlaylistContext,
};

const actions = useMediaContext();

const contextComponent = computed(() => contexts[props.context]);

const contextProps = computed(() => {
  const base = { actions };
  // Only the playlist context takes an extra prop; the rest take the actions.
  return props.context === "playlist"
    ? { ...base, isOwner: props.isPlaylistOwner }
    : base;
});
</script>
