import type { RouteRecordRaw } from "vue-router";
import { requireRouteParam } from "@/app/router/guards/require-route-param";
import { requireSourceAvailable } from "@/app/router/guards/require-source-available";
import { ROUTE_NAMES } from "@/app/router/route-names";

export const playlistRoutes: RouteRecordRaw[] = [
  {
    path: "/playlist/:id?",
    name: ROUTE_NAMES.PLAYLIST,
    component: () => import("@/pages/PlaylistPage.vue"),
    beforeEnter: [requireRouteParam("id"), requireSourceAvailable("id")],
    meta: {
      titleKey: "nav.playlist",
      depth: 1,
    },
  },
];
