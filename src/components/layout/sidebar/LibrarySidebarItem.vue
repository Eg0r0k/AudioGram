<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import type { LibraryItem } from "@/modules/library/types";
import { Badge } from "@/components/ui/badge";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import IconPinFilled from "~icons/tabler/pin-filled";
import IconVolume from "~icons/tabler/volume";
import IconFolder from "~icons/tabler/folder";
import { canOpenLibraryMenu, useLibraryMenu } from "@/modules/library/composables/useLibraryMenu";
import type { CoverOwnerType } from "@/db/entities";
import EntityCoverImage from "@/components/ui/EntityCoverImage.vue";
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import Link from "@/components/ui/link/Link.vue";

const props = defineProps<{
  item: LibraryItem;
  compact?: boolean;
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
  <TooltipProvider
    :delay-duration="150"
    disable-hoverable-content
  >
    <Tooltip>
      <TooltipTrigger as-child>
        <div
          v-ripple
          class="block rounded-sm focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none focus-visible:border-ring cursor-pointer"
          data-library-item
          :data-library-menu="canOpenLibraryMenu(item) ? undefined : 'none'"
          role="button"
          :class="compact ? '' : 'mx-2'"
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
              class="min-w-0 py-2 transition-colors pointer-events-none"
              :class="[
                isExactActive && item.type !== 'folder'
                  ? 'bg-primary text-primary-foreground hover:bg-primary/95'
                  : 'hover:bg-accent/60',
                compact ? 'justify-center gap-0 px-2' : 'gap-3 px-3',
              ]"
            >
              <div class="relative shrink-0">
                <ItemMedia
                  class="size-[54px] relative z-1 overflow-hidden"
                  :class="item.rounded ? 'rounded-full' : 'rounded-md'"
                >
                  <NuxtImage
                    v-if="hasStaticImage"
                    :src="item.image"
                    :placeholder="item.imageLow"
                    placeholder-class="blur-md scale-110"
                    :alt="item.title"
                    class="size-full object-cover transition-[filter,scale] duration-300"
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
                    v-if="compact && isCurrentPlaybackSource"
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
                    :class="isExactActive ? 'text-white' : 'text-primary'"
                    class="size-5"
                  />
                </span>
              </div>

              <ItemContent
                v-if="!compact"
                class="min-w-0 overflow-hidden"
              >
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

                    <Badge
                      v-if="item.type === 'folder'"
                      variant="secondary"
                      size="md"
                      class="shrink-0  h-5 min-w-5 px-1 py-0 font-medium!  text-white!"
                    >{{ item.folderItemCount ?? 0 }}</Badge>
                  </span>
                </ItemDescription>
              </ItemContent>
            </Item>
          </Link>
        </div>
      </TooltipTrigger>

      <TooltipContent
        v-if="compact"
        side="right"
        :side-offset="10"
      >
        <p class="font-medium">
          {{ item.title }}
        </p>
        <p class="text-muted-foreground">
          {{ subtitle }}
        </p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
