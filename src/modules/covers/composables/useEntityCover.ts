import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useQuery } from "@tanstack/vue-query";
import type { CoverOwnerType } from "@/db/entities";
import { queryKeys } from "@/queries/query-keys";
import { getCoverBlob } from "@/queries/cover.queries";
import { stableObjectUrl } from "../lib/stable-object-url";

export function useEntityCover(
  ownerType: MaybeRefOrGetter<CoverOwnerType | null | undefined>,
  ownerId: MaybeRefOrGetter<string | null | undefined>,
) {
  const query = useQuery({
    queryKey: computed(() => {
      const type = toValue(ownerType);
      const id = toValue(ownerId);

      return type && id
        ? queryKeys.covers.detail(type, id)
        : ["covers", "idle", "idle"] as const;
    }),
    queryFn: async () => {
      const type = toValue(ownerType);
      const id = toValue(ownerId);

      if (!type || !id) {
        return null;
      }

      return getCoverBlob(type, id);
    },
    enabled: computed(() => !!toValue(ownerType) && !!toValue(ownerId)),
  });

  // Stable across remounts (unlike useObjectUrl) so covers don't replay
  // their load animation on every panel switch.
  const url = computed(() => {
    const blob = query.data.value;
    const type = toValue(ownerType);
    const id = toValue(ownerId);
    if (!blob || !type || !id) return undefined;
    return stableObjectUrl(`${type}:${id}`, blob);
  });

  return {
    blob: query.data,
    url,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
