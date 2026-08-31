import type { RouteRecordRaw } from "vue-router";
import { ROUTE_NAMES } from "@/app/router/route-names";

export const favoriteRoutes: RouteRecordRaw[] = [
  {
    path: "/liked",
    name: ROUTE_NAMES.LIKED,
    component: () => import("@/pages/FavoritePage.vue"),
    meta: {
      titleKey: "nav.favorite",
      depth: 0,
    },
  },
];
