import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useI18n } from "vue-i18n";
import type { CoverOwnerType } from "@/db/entities";
import type { LibraryItem } from "@/modules/library/types";
import { useQueueStore } from "@/modules/queue/store/queue.store";

/**
 * Per-entity presentation of a LibraryItem row. All type switches live here:
 * which cover source an entity uses, how its subtitle reads, and how it
 * matches the queue's current playback source — the components only render
 * the resolved values.
 */
export const useLibraryItemView = (itemSource: MaybeRefOrGetter<LibraryItem>) => {
  const { t } = useI18n();
  const queueStore = useQueueStore();

  const item = computed(() => toValue(itemSource));

  const typeLabel = computed(() => t(`library.type.${item.value.type}`));

  const subtitle = computed(() =>
    item.value.subtitle
      ? `${typeLabel.value} · ${item.value.subtitle}`
      : typeLabel.value,
  );

  const coverOwnerType = computed<CoverOwnerType | null>(() => {
    switch (item.value.type) {
      case "album":
        return "album";
      case "playlist":
        return "playlist";
      case "artist":
        return "artist";
      default:
        return null;
    }
  });

  const coverOwnerId = computed(() =>
    coverOwnerType.value !== null ? item.value.id : null,
  );

  const isCurrentPlaybackSource = computed(() => {
    const source = queueStore.currentItem?.source;
    if (!source) return false;

    switch (item.value.type) {
      case "artist":
        return source.type === "artist" && source.artistId === item.value.id;
      case "album":
        return source.type === "album" && source.albumId === item.value.id;
      case "playlist":
        return source.type === "playlist" && source.playlistId === item.value.id;
      case "liked":
        return source.type === "liked";
      case "allMedia":
        return source.type === "allMedia";
      default:
        return false;
    }
  });

  return { typeLabel, subtitle, coverOwnerType, coverOwnerId, isCurrentPlaybackSource };
};
