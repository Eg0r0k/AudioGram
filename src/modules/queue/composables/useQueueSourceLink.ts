import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { RouteLocationRaw } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { routeLocation } from "@/app/router/route-locations";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { sourceKindOf } from "@/modules/sources/lib/display";
import { remoteListKindOf, useSourcePlaylists } from "@/modules/sources/composables/useSourceCatalog";
import { albumQueries } from "@/queries/album.queries";
import { artistQueries } from "@/queries/artist.queries";
import { playlistQueries } from "@/queries/playlist.queries";
import { AlbumId, ArtistId, PlaylistId } from "@/types/ids";

export interface QueueSourceLink {
  label: string;
  to: RouteLocationRaw;
}

const isLocalId = (id: string) => sourceKindOf(id) === "local";

/**
 * Where the current queue item was queued from, as something to navigate
 * to: album / artist / playlist / liked / the whole library. Null when the
 * origin has no page (search, manual, recommendations, ...) or its name
 * is not known yet.
 *
 * Library entities are named through their detail queries; a catalog
 * album or artist has no Dexie row, so its name comes off the track.
 */
export const useQueueSourceLink = () => {
  const queueStore = useQueueStore();
  const { t } = useI18n();

  const item = computed(() => queueStore.currentItem);
  const source = computed(() => item.value?.source ?? null);

  const albumId = computed(() => (source.value?.type === "album" ? source.value.albumId : null));
  const artistId = computed(() => (source.value?.type === "artist" ? source.value.artistId : null));
  const playlistId = computed(() => (source.value?.type === "playlist" ? source.value.playlistId : null));

  const { data: album } = useQuery(computed(() =>
    albumQueries.detail(albumId.value ?? AlbumId(""), !!albumId.value && isLocalId(albumId.value)),
  ));
  const { data: artist } = useQuery(computed(() =>
    artistQueries.detail(artistId.value ?? ArtistId(""), !!artistId.value && isLocalId(artistId.value)),
  ));
  const { data: playlist } = useQuery(computed(() =>
    playlistQueries.detail(playlistId.value ?? PlaylistId(""), !!playlistId.value && isLocalId(playlistId.value)),
  ));

  // A remote playlist has no Dexie row and, unlike an album or artist, no
  // name on the track either. The source's playlist list carries it and is
  // the same query the sidebar already loads while browsing that source.
  const remoteKind = computed(() =>
    (playlistId.value ? remoteListKindOf(playlistId.value, "playlists") : null),
  );
  const { data: remotePlaylists } = useSourcePlaylists(remoteKind);
  const remotePlaylistName = computed(() =>
    remotePlaylists.value?.find(entry => entry.id === playlistId.value)?.name,
  );

  const link = computed<QueueSourceLink | null>(() => {
    const current = source.value;
    const track = item.value?.track;
    if (!current) return null;

    switch (current.type) {
      case "album": {
        const label = isLocalId(current.albumId) ? album.value?.title : track?.albumName;
        return label ? { label, to: routeLocation.album(current.albumId) } : null;
      }
      case "artist": {
        const label = isLocalId(current.artistId) ? artist.value?.name : track?.artist;
        return label ? { label, to: routeLocation.artist(current.artistId) } : null;
      }
      case "playlist": {
        const label = isLocalId(current.playlistId) ? playlist.value?.name : remotePlaylistName.value;
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
