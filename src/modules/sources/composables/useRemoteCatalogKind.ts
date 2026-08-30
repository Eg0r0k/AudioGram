import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { albumRepository, artistRepository, playlistRepository } from "@/db/repositories";
import type { AlbumId, ArtistId, PlaylistId } from "@/types/ids";
import type { SourceKind } from "@/types/track-ref";
import type { SourceEntity } from "../types";
import { remoteCatalogKindOf } from "./useSourceCatalog";

//
// Which path a detail page takes for a given id.
//
// A remote-branded id is NOT automatically a catalog entity. Downloading or
// pinning a remote track runs the pin cascade, which creates real Dexie rows
// under the same "nd:"/"yt:" id — and those are library entities: the local
// search index lists them, and opening one must show the library page with
// its downloaded tracks, not the live catalog page.
//
// The two are told apart by `pinned`, exactly as the search index tells them
// apart: a pinned row is a library member, `pinned === 0` is a shadow row
// hanging off a download and carries no library meaning of its own.
//

// Playlists have no `pinned` flag because they have no shadow rows: the pin
// cascade builds tracks with their albums and artists, never a playlist. So
// any playlist row that exists is already a library playlist.
const LOOKUP: Record<SourceEntity, (id: string) => Promise<boolean>> = {
  artists: async (id) => {
    const found = await artistRepository.findById(id as ArtistId);
    return found.isOk() && (found.value?.pinned ?? 0) !== 0;
  },
  albums: async (id) => {
    const found = await albumRepository.findById(id as AlbumId);
    return found.isOk() && (found.value?.pinned ?? 0) !== 0;
  },
  playlists: async (id) => {
    const found = await playlistRepository.findById(id as PlaylistId);
    return found.isOk() && !!found.value;
  },
};

/**
 * The source to browse this id from, or null for the local Dexie path.
 *
 * Resolution waits for the Dexie lookup so the page never renders the
 * catalog first and swaps to the library row a tick later.
 */
export function useRemoteCatalogKind(entity: SourceEntity, id: MaybeRefOrGetter<string>) {
  // Only a remote-branded id can be ambiguous; a local id is local, and
  // asking Dexie about it would be a pointless round-trip.
  const candidate = computed(() => remoteCatalogKindOf(toValue(id), entity));

  const libraryRow = useQuery(computed(() => ({
    queryKey: ["library-entity", entity, toValue(id)] as const,
    queryFn: () => LOOKUP[entity](toValue(id)),
    enabled: candidate.value !== null,
  })));

  const isLibraryEntity = computed(() =>
    candidate.value !== null && libraryRow.data.value === true,
  );

  /** False only while a remote-branded id is still being looked up. */
  const isResolved = computed(() => candidate.value === null || !libraryRow.isLoading.value);

  const remoteKind = computed<SourceKind | null>(() =>
    (isResolved.value && !isLibraryEntity.value ? candidate.value : null),
  );

  return { remoteKind, isResolved, isLibraryEntity };
}
