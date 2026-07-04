<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import type { LibraryItem } from "@/modules/library/types";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import IconPinFilled from "~icons/tabler/pin-filled";
import IconVolume from "~icons/tabler/volume";
import IconFolder from "~icons/tabler/folder";
import { useLibraryMenu } from "@/modules/library/composables/useLibraryMenu";
import type { CoverOwnerType } from "@/db/entities";
import EntityCoverImage from "@/components/ui/EntityCoverImage.vue";
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import Link from "@/components/ui/link/Link.vue";

const props = defineProps<{
  item: LibraryItem;
}>();

const emit = defineEmits<{
  openFolder: [folderId: string];
}>();

const { t } = useI18n();
const { openMenu } = useLibraryMenu();
const queueStore = useQueueStore();
const router = useRouter();

const typeLabel = computed(() => {
  return t(`library.type.${props.item.type}`);
});

const subtitle = computed(() => {
  return props.item.subtitle
    ? `${typeLabel.value} · ${props.item.subtitle}`
    : typeLabel.value;
});

const coverOwnerType = computed<CoverOwnerType | null>(() => {
  if (props.item.type === "folder") return null;
  if (props.item.type === "album") return "album";
  if (props.item.type === "playlist") return "playlist";
  if (props.item.type === "artist") return "artist";
  return null;
});

const coverOwnerId = computed(() => {
  if (
    props.item.type === "album"
    || props.item.type === "playlist"
    || props.item.type === "artist"
  ) {
    return props.item.id;
  }
  return null;
});
const hasStaticImage = computed(() => !!props.item.image);

const isCurrentPlaybackSource = computed(() => {
  if (props.item.type === "folder") return false;

  const source = queueStore.currentItem?.source;
  if (!source) return false;

  switch (props.item.type) {
    case "artist":
      return source.type === "artist" && source.artistId === props.item.id;
    case "album":
      return source.type === "album" && source.albumId === props.item.id;
    case "playlist":
      return source.type === "playlist" && source.playlistId === props.item.id;
    case "liked":
      return source.type === "liked";
    case "allMedia":
      return source.type === "allMedia";
    default:
      return false;
  }
});

const handleClick = () => {
  if (props.item.type === "folder") {
    emit("openFolder", props.item.id);
    return;
  }

  router.push(props.item.to);
};
</script>

<template>
  <div
    v-ripple
    class="block  rounded-sm focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none focus-visible:border-ring cursor-pointer"
    data-library-item
    role="button"
    tabindex="0"
    @click="handleClick"
    @keydown.enter="handleClick"
    @contextmenu="openMenu(item)"
  >
    <Link
      v-slot="{ isExactActive }"
      :to="item.to"
      inactive
    >
      <Item
        class="gap-3 px-3 py-2 min-w-0 transition-colors pointer-events-none"
        :class="isExactActive && item.type !== 'folder'
          ? 'bg-primary text-primary-foreground hover:bg-primary/95'
          : 'hover:bg-accent/60'"
      >
        <ItemMedia
          class="size-[54px] z-1 overflow-hidden"
          :class="item.rounded ? 'rounded-full' : 'rounded-md'"
        >
          <NuxtImage
            v-if="hasStaticImage"
            :src="item.image"
            :alt="item.title"
            class="size-full object-cover mb-1"
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
            class="size-full object-cover mb-1"
            :image-class="item.rounded
              ? 'size-full object-cover rounded-full'
              : 'size-full object-cover rounded-md'"
          />
        </ItemMedia>

        <ItemContent class="min-w-0 overflow-hidden">
          <ItemTitle
            class="block min-w-0 w-full! overflow-hidden text-ellipsis whitespace-nowrap"
            :class="isExactActive ? 'text-primary-foreground' : ''"
          >
            <span class="flex items-center min-w-0 gap-1">
              <span
                class="truncate"
                :title="item.title"
              >
                {{ item.title }}
              </span>

              <IconVolume
                v-if="isCurrentPlaybackSource"
                class="size-5 shrink-0"
                :class="isExactActive ? 'text-white' : 'text-primary'"
              />
            </span>
          </ItemTitle>

          <ItemDescription
            class="block min-w-0"
            :class="isExactActive ? 'text-primary-foreground' : ''"
          >
            <span class="flex items-center min-w-0 gap-1">
              <span
                class="min-w-0 flex-1 truncate"
                :title="subtitle"
              >
                {{ subtitle }}
              </span>

              <IconPinFilled
                v-if="item.isPinned"
                class="size-5 shrink-0"
                :class="isExactActive ? 'text-white' : 'text-primary'"
              />
            </span>
          </ItemDescription>
        </ItemContent>
      </Item>
    </Link>
  </div>
</template>
