import { useRouter } from "vue-router";
import { useLibraryStore } from "../store/library.store";
import { storeToRefs } from "pinia";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { LIBRARY_FILTERS, type FolderLibraryItemType, type LibraryFilter, type LibraryFolderEntry, type LibraryItem } from "../types";
import { clearAllData } from "@/services/storage-info.service";
import { createAlbumAndSync, deleteAlbumAndSync } from "@/queries/album.queries";
import { createArtistAndSync, deleteArtistAndSync } from "@/queries/artist.queries";
import {
  createFolderAndSync,
  deleteFolderAndSync,
  removeFolderItemAndSync,
  renameFolderAndSync,
  setFolderItemsAndSync,
} from "@/queries/folder.queries";
import {
  clearLibraryData,
  invalidateLibraryData,
  libraryQueries,
} from "@/queries/library.queries";
import {
  createPlaylistAndSync,
  deletePlaylistAndSync,
} from "@/queries/playlist.queries";
import DeleteConfirmDialog from "@/components/dialogs/DeleteConfirmDialog.vue";
import MoveToFolderDialog from "@/components/dialogs/MoveToFolderDialog.vue";
import { summonDialog } from "@/components/dialogs/summon";
import type { DeleteConfirmData, DeleteConfirmResult } from "@/components/dialogs/deleteConfirm";
import { sourceKindOf } from "@/modules/sources/lib/display";
import type { AlbumId, ArtistId, PlaylistId, SidebarFolderId } from "@/types/ids";
import { SidebarFolderId as createSidebarFolderId } from "@/types/ids";
import { routeLocation } from "@/app/router/route-locations";
import { ROUTE_NAMES } from "@/app/router/route-names";

export const useLibrary = () => {
  const store = useLibraryStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const { sortBy, activeFilter, searchQuery } = storeToRefs(store);
  const navigateHome = () => router.push(routeLocation.home());

  const libraryItemRouteNames = {
    artist: ROUTE_NAMES.ARTIST,
    album: ROUTE_NAMES.ALBUM,
    playlist: ROUTE_NAMES.PLAYLIST,
  } as const;

  const navigateHomeIfViewingItem = (item: LibraryItem) => {
    const currentRoute = router.currentRoute.value;

    if (item.type === "liked" || item.type === "allMedia" || item.type === "folder") return;
    if (currentRoute.name !== libraryItemRouteNames[item.type]) return;
    if (currentRoute.params.id !== item.id) return;

    return navigateHome();
  };

  const { data, isLoading } = useQuery(libraryQueries.summary());
  const artists = computed(() => data.value?.artists ?? []);
  const albums = computed(() => data.value?.albums ?? []);
  const playlists = computed(() => data.value?.playlists ?? []);
  const folders = computed(() => data.value?.folders ?? []);
  const likedTracks = computed(() => data.value?.likedTracks ?? []);

  const artistMap = computed(() => {
    const map = new Map<string, string>();

    for (const artist of artists.value) {
      map.set(artist.id, artist.name);
    }

    return map;
  });

  const likedItem = computed<LibraryItem>(() => ({
    id: "liked",
    type: "liked",
    title: t("common.favorite"),
    subtitle: t("common.trackCount", { count: likedTracks.value?.length ?? 0 }),
    image: "/img/liked-fallback.svg",
    isPinned: true,
    isSystem: true,
    addedAt: 0,
    updatedAt: 0,
    to: routeLocation.liked(),
    rounded: false,
  }));
  const allMusic = computed<LibraryItem> (() => ({
    id: "all",
    type: "allMedia",
    title: t("library.allMusic.title"),
    image: "/img/media.svg",
    isPinned: true,
    isSystem: true,
    addedAt: 0,
    updatedAt: 0,
    to: routeLocation.allMusic(),
    rounded: false,
  }));

  const allItems = computed<LibraryItem[]>(() => {
    const items: LibraryItem[] = [likedItem.value, allMusic.value];

    for (const artist of artists.value) {
      items.push({
        id: artist.id,
        type: "artist",
        title: artist.name,
        isPinned: store.isPinned("artist", artist.id),
        addedAt: artist.addedAt,
        updatedAt: artist.updatedAt,
        artistName: artist.name,
        to: routeLocation.artist(artist.id),
        rounded: true,
        trackCount: artist.trackCount,
      });
    }

    for (const album of albums.value) {
      const artistName = artistMap.value.get(album.artistId);

      items.push({
        id: album.id,
        type: "album",
        title: album.title,
        subtitle: artistName,
        isPinned: store.isPinned("album", album.id),
        addedAt: album.addedAt,
        updatedAt: album.updatedAt,
        artistName,
        to: routeLocation.album(album.id),
        rounded: false,
        trackCount: album.trackCount,
      });
    }

    for (const playlist of playlists.value) {
      items.push({
        id: playlist.id,
        type: "playlist",
        title: playlist.name,
        subtitle: t("common.trackCount", playlist.trackIds.length),
        isPinned: store.isPinned("playlist", playlist.id),
        addedAt: playlist.addedAt,
        updatedAt: playlist.updatedAt,
        to: routeLocation.playlist(playlist.id),
        rounded: false,
        trackCount: playlist.trackIds.length,
      });
    }

    return items;
  });

  const folderItemKey = (item: LibraryFolderEntry) => `${item.type}:${item.id}`;

  const folderItemKeys = computed(() => {
    const keys = new Set<string>();
    for (const folder of folders.value) {
      for (const item of folder.items) {
        keys.add(folderItemKey(item));
      }
    }
    return keys;
  });

  const itemByKey = computed(() => {
    const map = new Map<string, LibraryItem>();
    for (const item of allItems.value) {
      if (item.type === "artist" || item.type === "album" || item.type === "playlist") {
        map.set(`${item.type}:${item.id}`, item);
      }
    }
    return map;
  });

  const folderItems = computed<LibraryItem[]>(() => folders.value.map(folder => ({
    id: folder.id,
    type: "folder",
    title: folder.name,
    // The item count renders as a badge on the row, not in the subtitle.
    isPinned: false,
    addedAt: folder.addedAt,
    updatedAt: folder.updatedAt,
    to: routeLocation.home(),
    rounded: false,
    folderItemCount: folder.items.length,
  })));

  const rootItems = computed<LibraryItem[]>(() => [
    ...allItems.value.filter((item) => {
      if (item.type !== "artist" && item.type !== "album" && item.type !== "playlist") return true;
      return !folderItemKeys.value.has(`${item.type}:${item.id}`);
    }),
    ...folderItems.value,
  ]);

  const shouldShowSystemItems = computed(() =>
    activeFilter.value === "all" || activeFilter.value === "album",
  );

  const filteredItems = computed(() => {
    const systemItems = shouldShowSystemItems.value
      ? rootItems.value.filter(item => item.isSystem)
      : [];

    let items = rootItems.value.filter(item => !item.isSystem);

    if (activeFilter.value !== "all") {
      items = items.filter(item => item.type === activeFilter.value);
    }

    const q = searchQuery.value.trim().toLowerCase();
    if (q) {
      items = items.filter(item =>
        item.title.toLowerCase().includes(q)
        || item.subtitle?.toLowerCase().includes(q)
        || item.artistName?.toLowerCase().includes(q),
      );
    }

    return [...systemItems, ...items];
  });

  const sortedItems = computed(() => {
    const items = [...filteredItems.value];

    const pinnedOrder = new Map<string, number>();
    for (const pinned of store.pinnedItems) {
      pinnedOrder.set(`${pinned.type}:${pinned.id}`, pinned.pinnedAt);
    }

    items.sort((a, b) => {
      if (a.isSystem && !b.isSystem) return -1;
      if (!a.isSystem && b.isSystem) return 1;
      if (a.type === "folder" && b.type !== "folder") return -1;
      if (a.type !== "folder" && b.type === "folder") return 1;

      const aPinned = a.isPinned ? 1 : 0;
      const bPinned = b.isPinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      if (a.isPinned && b.isPinned && !a.isSystem && !b.isSystem) {
        const aOrder = pinnedOrder.get(`${a.type}:${a.id}`) ?? 0;
        const bOrder = pinnedOrder.get(`${b.type}:${b.id}`) ?? 0;
        return aOrder - bOrder;
      }

      switch (sortBy.value) {
        case "recent":
          return b.addedAt - a.addedAt;
        case "updated":
          return (b.updatedAt ?? b.addedAt) - (a.updatedAt ?? a.addedAt);
        case "alphabetical":
          return a.title.localeCompare(b.title);
        case "author":
          return (a.artistName ?? a.title).localeCompare(b.artistName ?? b.title);
        default:
          return 0;
      }
    });

    return items;
  });

  const pinnedItems = computed(() => sortedItems.value.filter(item => item.isPinned));
  const unpinnedItems = computed(() => sortedItems.value.filter(item => !item.isPinned));
  const isEmpty = computed(() => rootItems.value.length === 0 && !isLoading.value);
  const hasResults = computed(() => sortedItems.value.length > 0);

  const availableFilters = computed<LibraryFilter[]>(() => {
    return LIBRARY_FILTERS.filter((filter) => {
      switch (filter) {
        case "all":
          return true;
        case "artist":
          return artists.value.length > 0;
        case "album":
          return albums.value.length > 0;
        case "playlist":
          return playlists.value.length > 0;
      }
    });
  });

  const createPlaylist = async () => {
    const playlist = await createPlaylistAndSync(queryClient, t("playlist.newPlaylist"));
    router.push(routeLocation.playlist(playlist.id));
  };

  const createArtist = async () => {
    const artist = await createArtistAndSync(queryClient, t("artist.newArtist"));
    router.push(routeLocation.artist(artist.id));
  };

  const createAlbum = async () => {
    const artist = await createArtistAndSync(queryClient, t("artist.newArtist"));
    const album = await createAlbumAndSync(queryClient, artist.id, t("album.newAlbum"));
    router.push(routeLocation.album(album.id));
  };

  const createFolder = async (name = t("library.folder.newFolder")) => {
    return createFolderAndSync(queryClient, name);
  };

  const renameFolder = async (folderId: string, name: string) => {
    await renameFolderAndSync(queryClient, createSidebarFolderId(folderId), name);
  };

  const deleteFolder = async (folderId: string) => {
    await deleteFolderAndSync(queryClient, createSidebarFolderId(folderId));
  };

  const setFolderItems = async (folderId: string, items: LibraryFolderEntry[]) => {
    await setFolderItemsAndSync(queryClient, createSidebarFolderId(folderId), items);
  };

  const getFolderItems = (folderId: string) => {
    const folder = folders.value.find(folder => folder.id === folderId as SidebarFolderId);
    if (!folder) return [];

    return folder.items.flatMap((entry) => {
      const item = itemByKey.value.get(folderItemKey(entry));
      return item ? [item] : [];
    });
  };

  const movableItems = computed(() => allItems.value.filter((item): item is LibraryItem & { type: FolderLibraryItemType } => {
    return item.type === "artist" || item.type === "album" || item.type === "playlist";
  }));

  const invalidateLibrary = async () => {
    await invalidateLibraryData(queryClient);
  };

  // Summoned like the delete confirm so the action works from every
  // LibraryContextMenu host (sidebar, artist pages, search), not only the
  // sidebar that used to own the dialog. The repository strips the entry
  // from any other folder on write, so appending is a move.
  const moveToFolder = async (item: LibraryItem) => {
    if (item.type !== "artist" && item.type !== "album" && item.type !== "playlist") return;

    const folderId = await summonDialog<string>(MoveToFolderDialog, {
      item,
      folders: folders.value,
    }, { key: `move-to-folder:${item.type}:${item.id}` });
    if (!folderId) return;

    const folder = folders.value.find(folder => folder.id === folderId);
    if (!folder) return;

    await setFolderItems(folderId, [...folder.items, { type: item.type, id: item.id }]);
  };

  const deleteItem = async (item: LibraryItem) => {
    if (item.type === "liked" || item.type === "allMedia") return;

    const result = await summonDialog<DeleteConfirmResult>(DeleteConfirmDialog, {
      data: {
        type: item.type as "artist" | "album" | "playlist",
        id: item.id as AlbumId | ArtistId | PlaylistId,
        name: item.title,
        trackCount: item.trackCount ?? 0,
        defaultDeleteTracks: item.type === "album" && sourceKindOf(item.id) !== "local",
      } satisfies DeleteConfirmData,
    }, { key: `delete:${item.id}` });
    if (!result) return;

    const options = { deleteTracks: result.deleteTracks };

    switch (item.type) {
      case "artist":
        await deleteArtistAndSync(queryClient, artists.value.find(artist => artist.id === item.id) ?? null, options);
        store.unpin("artist", item.id);
        await removeFolderItemAndSync(queryClient, "artist", item.id);
        await navigateHomeIfViewingItem(item);
        break;
      case "album":
        await deleteAlbumAndSync(queryClient, albums.value.find(album => album.id === item.id) ?? null, options);
        store.unpin("album", item.id);
        await removeFolderItemAndSync(queryClient, "album", item.id);
        await navigateHomeIfViewingItem(item);
        break;
      case "playlist":
        await deletePlaylistAndSync(queryClient, playlists.value.find(playlist => playlist.id === item.id) ?? null, options);
        store.unpin("playlist", item.id);
        await removeFolderItemAndSync(queryClient, "playlist", item.id);
        await navigateHomeIfViewingItem(item);
        break;
    }
  };

  const clearLibrary = async () => {
    await clearAllData();
    store.clearPins();
    await clearLibraryData(queryClient);
  };

  return {
    sortBy,
    activeFilter,
    searchQuery,
    allItems,
    rootItems,
    folders,
    movableItems,
    pinnedItems,
    unpinnedItems,
    availableFilters,
    isLoading,
    isEmpty,
    hasResults,
    setFilter: store.setFilter,
    setSortBy: store.setSortBy,
    setSearchQuery: store.setSearchQuery,
    clearSearch: store.clearSearch,
    togglePin: store.togglePin,
    isPinned: store.isPinned,
    createPlaylist,
    createArtist,
    createAlbum,
    createFolder,
    renameFolder,
    deleteFolder,
    setFolderItems,
    getFolderItems,
    invalidateLibrary,
    deleteItem,
    moveToFolder,
    clearLibrary,
  };
};
