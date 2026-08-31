import type { RouteRecordRaw } from "vue-router";
import { requireRouteParam } from "@/app/router/guards/require-route-param";
import { requireSourceAvailable } from "@/app/router/guards/require-source-available";
import { ROUTE_NAMES } from "@/app/router/route-names";

export const albumRoutes: RouteRecordRaw[] = [
  {
    path: "/album/:id?",
    name: ROUTE_NAMES.ALBUM,
    component: () => import("@/pages/AlbumPage.vue"),
    beforeEnter: [requireRouteParam("id"), requireSourceAvailable("id")],
    meta: {
      titleKey: "nav.album",
      depth: 1,
    },
  },
];
