import { computed, toValue, type MaybeRefOrGetter, type Ref } from "vue";
import type { SourceEntity } from "../types";
import { useRemoteCatalogKind } from "./useRemoteCatalogKind";

//
// The album / artist / playlist pages all straddle two data paths: a Dexie
// row with paged tracks, or a live catalog entity from a source. Which one
// is live, when each query may fetch, and how the two loading states read as
// one — that bookkeeping is identical on all three pages and lives here.
//

/** The loading/error surface of one query, however it was created. */
export interface EntityQueryState {
  isLoading: Readonly<Ref<boolean>>;
  isError: Readonly<Ref<boolean>>;
}

export const useCatalogEntity = <TId extends string>(
  entity: SourceEntity,
  id: MaybeRefOrGetter<TId>,
) => {
  // The path is picked by id AND by whether a pinned library row exists under
  // it: a downloaded remote entity is a library entity, not a catalog one.
  const { remoteKind, isResolved } = useRemoteCatalogKind(entity, id);
  const isRemote = computed(() => remoteKind.value !== null);

  /** Id for the source query; null parks it on skipToken. */
  const remoteId = computed<TId | null>(() => (isRemote.value ? toValue(id) : null));

  /** The Dexie query may only fetch once the path is known to be local. */
  const localEnabled = computed(() => isResolved.value && !isRemote.value);

  /**
   * `enabled: false` stops the fetch, not the cache read: a row left by an
   * earlier library visit would otherwise make the catalog view believe it
   * has a Dexie entity behind it — down to the context menus it offers.
   */
  const libraryRow = <TRow>(data: Readonly<Ref<TRow | undefined>>) =>
    computed(() => (isRemote.value ? null : data.value ?? null));

  /** Whichever path is live, as the one loading/error pair a page renders. */
  const pathState = (remote: EntityQueryState, local: EntityQueryState) => ({
    isError: computed(() => (isRemote.value ? remote.isError.value : local.isError.value)),
    isLoading: computed(() =>
      !isResolved.value || (isRemote.value ? remote.isLoading.value : local.isLoading.value),
    ),
  });

  return { remoteKind, isResolved, isRemote, remoteId, localEnabled, libraryRow, pathState };
};
