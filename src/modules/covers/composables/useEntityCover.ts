import { computed, onScopeDispose, toValue, watch, type MaybeRefOrGetter } from "vue";
import type { CoverOwnerType } from "@/db/entities";
import { coverCache, type CoverOwnerRef } from "../lib/cover-cache";

/**
 * A Dexie-stored cover for one owner, from the shared cover cache: the URL
 * stays identical across remounts (no replayed load animation), the Blob is
 * there for consumers that need bytes (media session artwork), and the
 * lookup is batched with every other cover requested in the same tick.
 * A null owner resolves to nothing without touching the cache.
 */
export function useEntityCover(
  ownerType: MaybeRefOrGetter<CoverOwnerType | null | undefined>,
  ownerId: MaybeRefOrGetter<string | null | undefined>,
) {
  const owner = computed<CoverOwnerRef | null>(() => {
    const type = toValue(ownerType);
    const id = toValue(ownerId);
    return type && id ? { ownerType: type, ownerId: id } : null;
  });

  let release: (() => void) | null = null;
  watch(owner, (next) => {
    release?.();
    release = next ? coverCache.acquire(next) : null;
  }, { immediate: true });
  onScopeDispose(() => release?.());

  const entry = computed(() => (owner.value ? coverCache.entryFor(owner.value) : null));

  const url = computed(() => entry.value?.url);
  const blob = computed<Blob | null>(() => entry.value?.blob ?? null);
  const isLoading = computed(() => owner.value !== null && entry.value === undefined);

  return { blob, url, isLoading };
}
