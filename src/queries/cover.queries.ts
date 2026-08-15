import type { CoverOwnerType } from "@/db/entities";
import { coverRepository } from "@/db/repositories";
import { queryKeys } from "@/queries/query-keys";
import { queryOptions } from "@tanstack/vue-query";
import { unwrapResult } from "./shared";

export async function getCoverBlob(
  ownerType: CoverOwnerType,
  ownerId: string,
) {
  const cover = await unwrapResult(coverRepository.findByOwner(ownerType, ownerId));
  return cover?.blob ?? null;
}

export const coverQueries = {
  detail: (
    ownerType: CoverOwnerType,
    ownerId: string,
    enabled = true,
  ) =>
    queryOptions({
      queryKey: queryKeys.covers.detail(ownerType, ownerId),
      queryFn: () => getCoverBlob(ownerType, ownerId),
      enabled,
    }),
} as const;
