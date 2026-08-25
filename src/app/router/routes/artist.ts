import { RouteRecordRaw } from "vue-router";
import { requireRouteParam } from "@/app/router/guards/require-route-param";
import { ROUTE_NAMES } from "@/app/router/route-names";

export const artistRoutes: RouteRecordRaw[] = [
  {
    path: "/artist/:id?",
    name: ROUTE_NAMES.ARTIST,
    component: () => import("@/pages/ArtistPage.vue"),
    beforeEnter: requireRouteParam("id"),
    meta: {
      titleKey: "nav.artist",
    },
  },
  {
    path: "/artist/:id/albums",
    name: ROUTE_NAMES.ARTIST_ALBUMS,
    component: () => import("@/pages/ArtistAlbumsPage.vue"),
    beforeEnter: requireRouteParam("id"),
    meta: {
      titleKey: "artist.albums",
      depth: 2,
    },
  },
];
