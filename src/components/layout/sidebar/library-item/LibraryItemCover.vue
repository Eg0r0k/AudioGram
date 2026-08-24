<script setup lang="ts">
import { computed } from "vue";
import type { CoverOwnerType } from "@/db/entities";
import type { LibraryItem } from "@/modules/library/types";
import { ItemMedia } from "@/components/ui/item";
import EntityCoverImage from "@/components/ui/EntityCoverImage.vue";
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import IconFolder from "~icons/tabler/folder-filled";
import IconPinFilled from "~icons/tabler/pin-filled";
import IconVolume from "~icons/tabler/volume";

const props = defineProps<{
  item: LibraryItem;
  coverOwnerType: CoverOwnerType | null;
  coverOwnerId: string | null;
  compact?: boolean;
  active?: boolean;
  isPlaybackSource?: boolean;
}>();

const hasStaticImage = computed(() => !!props.item.image);
</script>

<template>
  <div class="relative  shrink-0 mb-px">
    <ItemMedia
      class="size-[55px] aspect-square relative z-1 overflow-hidden "
      :class="item.rounded ? 'rounded-full' : 'rounded-md'"
    >
      <NuxtImage
        v-if="hasStaticImage"
        :src="item.image"
        :placeholder="item.imageLow"
        placeholder-class="blur-md scale-110"
        :alt="item.title"
        class="object-cover transition-[filter,scale] duration-300"
      />

      <div
        v-else-if="item.type === 'folder'"
        class="size-full rounded-md bg-[#3d3d3d] text-primary flex items-center justify-center"
      >
        <IconFolder class="size-8" />
      </div>

      <EntityCoverImage
        v-else
        :owner-type="coverOwnerType"
        :owner-id="coverOwnerId"
        :alt="item.title"
        class="size-full object-cover"
        :image-class="item.rounded
          ? 'size-full object-cover rounded-full'
          : 'size-full object-cover rounded-md'"
      />

      <div
        v-if="compact && isPlaybackSource"
        class="absolute inset-0 z-10 flex items-center justify-center bg-black/50"
      >
        <IconVolume class="size-6 text-white" />
      </div>
    </ItemMedia>

    <span
      v-if="compact && item.isPinned"
      class="absolute -top-1 -right-1 z-10 flex size-5 items-center justify-center"
    >
      <IconPinFilled
        :class="active ? 'text-white' : 'text-primary'"
        class="size-5"
      />
    </span>
  </div>
</template>
