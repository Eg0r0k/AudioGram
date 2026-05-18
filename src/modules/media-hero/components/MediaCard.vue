<template>
  <Link
    :to="to"
    class="block min-w-36 w-full"
    :draggable="false"
    @contextmenu="$emit('contextmenu', $event)"
  >
    <div
      class="flex group cursor-pointer select-none flex-col p-3 gap-2 rounded-lg hover:bg-muted transition-colors w-full"
    >
      <div class="relative">
        <div
          class="aspect-square overflow-hidden bg-muted shadow-sm group-hover:shadow-md transition-shadow"
          :class="rounded ? 'rounded-full' : 'rounded-md'"
        >
          <EntityCoverImage
            :owner-type="coverOwnerType"
            :owner-id="coverOwnerId"
            :alt="title"
            :placeholder="true"
            :image-class="'size-full object-cover'"
          />
        </div>

        <div
          class="absolute bottom-0 right-0 sm:bottom-2 sm:right-2"
          :class="rounded ? 'bottom-4 right-4 sm:bottom-5 sm:right-5' : ''"
        >
          <Button
            size="icon-lg"
            class="rounded-full size-12 transition-[opacity,transform,box-shadow] duration-200 shadow-lg"
            :class="isActiveSource
              ? 'translate-y-0 opacity-100'
              : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100'"
            @click.prevent.stop="handlePlay"
          >
            <IconPause
              v-if="isPlaying"
              class="size-5 fill-current"
            />
            <IconPlay
              v-else
              class="size-5 fill-current"
            />
          </Button>
        </div>
      </div>

      <div class="flex flex-col min-w-0">
        <span
          class="font-semibold truncate"
          :class="rounded ? 'text-center' : ''"
        >
          {{ title }}
        </span>
        <span
          v-if="subtitle"
          class="text-sm text-muted-foreground truncate"
          :class="rounded ? 'text-center' : ''"
        >
          {{ subtitle }}
        </span>
      </div>
    </div>
  </Link>
</template>

<script lang="ts" setup>
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import IconPlay from "~icons/tabler/player-play-filled";
import IconPause from "~icons/tabler/player-pause-filled";
import type { RouteLocationRaw } from "vue-router";
import type { QueueSource } from "@/modules/queue/types";
import { usePlaybackState } from "@/modules/player/composables/usePlaybackState";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { CoverOwnerType } from "@/db/entities";
import { computed } from "vue";
import EntityCoverImage from "@/components/ui/EntityCoverImage.vue";

const props = withDefaults(defineProps<{
  title: string;
  subtitle?: string;
  coverOwnerType?: CoverOwnerType | null;
  coverOwnerId?: string | null;
  to: RouteLocationRaw;
  rounded?: boolean;
  source?: QueueSource;
}>(), {
  subtitle: undefined,
  coverOwnerType: null,
  coverOwnerId: null,
  rounded: false,
  source: undefined,
});

const emit = defineEmits<{
  play: [];
  contextmenu: [event: MouseEvent];
}>();

const playerStore = usePlayerStore();
const { isActiveSource, isPlaying } = usePlaybackState(
  () => props.source ?? { type: "unknown" },
);

function handlePlay() {
  if (isActiveSource.value) {
    playerStore.togglePlay();
  }
  else {
    emit("play");
  }
}

const coverOwnerType = computed(() => props.coverOwnerType);
const coverOwnerId = computed(() => props.coverOwnerId);
</script>
