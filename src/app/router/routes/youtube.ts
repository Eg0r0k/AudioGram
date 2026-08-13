import type { RouteRecordRaw } from "vue-router";
import { ROUTE_NAMES } from "@/app/router/route-names";
import { requireRouteParam } from "@/app/router/guards/require-route-param";
import { requireYoutube } from "@/app/router/guards/require-youtube";

export const youtubeRoutes: RouteRecordRaw[] = [
  {
    path: "/youtube/playlist/:id",
    name: ROUTE_NAMES.YOUTUBE_PLAYLIST,
    component: () => import("@/pages/YtPlaylistPage.vue"),
    beforeEnter: [requireRouteParam("id"), requireYoutube],
    meta: {
      titleKey: "youtube.title",
      depth: 2,
    },
  },
  {
    path: "/youtube/album/:id",
    name: ROUTE_NAMES.YOUTUBE_ALBUM,
    component: () => import("@/pages/YtAlbumPage.vue"),
    beforeEnter: [requireRouteParam("id"), requireYoutube],
    meta: {
      titleKey: "youtube.title",
      depth: 2,
    },
  },
  {
    path: "/youtube/artist/:id",
    name: ROUTE_NAMES.YOUTUBE_ARTIST,
    component: () => import("@/pages/YtArtistPage.vue"),
    beforeEnter: [requireRouteParam("id"), requireYoutube],
    meta: {
      titleKey: "youtube.title",
      depth: 2,
    },
  },
];
