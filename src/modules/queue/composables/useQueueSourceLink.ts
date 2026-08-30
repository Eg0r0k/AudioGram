import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { RouteLocationRaw } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { routeLocation } from "@/app/router/route-locations";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { remoteCatalogKindOf, remoteListKindOf } from "@/modules/sources/lib/catalog-kind";
import { sourceKindOf } from "@/modules/sources/lib/display";
import { useSourcePlaylistMeta, useSourcePlaylists } from "@/modules/sources/composables/useSourceCatalog";
import { albumQueries } from "@/queries/album.queries";
import { artistQueries } from "@/queries/artist.queries";
import { playlistQueries } from "@/queries/playlist.queries";

export interface QueueSourceLink {
  label: string;
  to: RouteLocationRaw;
}

/**
 * Where the current queue item was queued from, as something to navigate
 * to: album / artist / playlist / liked / the whole library. Null when the
 * origin has no page (search, manual, recommendations, ...) or its name
 * is not known yet.
 *
 * Names come from the Dexie row when there is one — a downloaded remote
 * entity has one under its branded id — and off the source otherwise.
 */
export const useQueueSourceLink = () => {
  const queueStore = useQueueStore();
  const { t } = useI18n();

  const item = computed(() => queueStore.currentItem);
  const source = computed(() => item.value?.source ?? null);

  const albumId = computed(() => (source.value?.type === "album" ? source.value.albumId : null));
  const artistId = computed(() => (source.value?.type === "artist" ? source.value.artistId : null));
  const playlistId = computed(() => (source.value?.type === "playlist" ? source.value.playlistId : null));

  // Row-or-null, not `detail`: a catalog id legitimately has no row, and
  // asking `detail` about one would raise "not found" on every queue change.
  const { data: album } = useQuery(computed(() => albumQueries.libraryRow(albumId.value)));
  const { data: artist } = useQuery(computed(() => artistQueries.libraryRow(artistId.value)));
  const { data: playlist } = useQuery(computed(() => playlistQueries.libraryRow(playlistId.value)));

  // A remote playlist has no name on the track either, unlike an album or an
  // artist. Where the source lists its playlists, the sidebar has already
  // loaded that list and it costs nothing; where it does not — a source that
  // only opens playlists by id — the playlist's own metadata is asked for.
  const listKind = computed(() =>
    (playlistId.value ? remoteListKindOf(playlistId.value, "playlists") : null),
  );
  const { data: remotePlaylists } = useSourcePlaylists(listKind);
  const listedName = computed(() =>
    remotePlaylists.value?.find(entry => entry.id === playlistId.value)?.name,
  );

  const metaKind = computed(() =>
    (playlistId.value && !listedName.value
      ? remoteCatalogKindOf(playlistId.value, "playlists")
      : null),
  );
  const { data: remotePlaylistMeta } = useSourcePlaylistMeta(metaKind, playlistId);

  const remotePlaylistName = computed(() => listedName.value ?? remotePlaylistMeta.value?.name);

  /**
   * The row's name wins; the fallback is only for ids that may legitimately
   * have no row. A local entity always has one, and waiting for it beats
   * flashing the track's denormalized copy, which a rename leaves stale.
   */
  const nameOf = (id: string, row: string | undefined, fallback: string | undefined) =>
    row ?? (sourceKindOf(id) === "local" ? undefined : fallback);

  const link = computed<QueueSourceLink | null>(() => {
    const current = source.value;
    const track = item.value?.track;
    if (!current) return null;

    switch (current.type) {
      case "album": {
        const label = nameOf(current.albumId, album.value?.title, track?.albumName);
        return label ? { label, to: routeLocation.album(current.albumId) } : null;
      }
      case "artist": {
        const label = nameOf(current.artistId, artist.value?.name, track?.artist);
        return label ? { label, to: routeLocation.artist(current.artistId) } : null;
      }
      case "playlist": {
        const label = nameOf(current.playlistId, playlist.value?.name, remotePlaylistName.value);
        return label ? { label, to: routeLocation.playlist(current.playlistId) } : null;
      }
      case "liked":
        return { label: t("media.type.liked"), to: routeLocation.liked() };
      case "allMedia":
        return { label: t("library.allMusic.title"), to: routeLocation.allMusic() };
      default:
        return null;
    }
  });

  return { link };
};
