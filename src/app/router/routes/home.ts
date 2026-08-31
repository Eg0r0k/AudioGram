import type { RouteRecordRaw } from "vue-router";
import { ROUTE_NAMES } from "@/app/router/route-names";

export const homeRoutes: RouteRecordRaw[] = [
  {
    path: "/",
    name: ROUTE_NAMES.HOME,
    component: () => import("@/pages/IndexPage.vue"),
    meta: {
      titleKey: "nav.home",
      depth: 0,
    },
  },
  {
    path: "/all",
    name: ROUTE_NAMES.ALL_MUSIC,
    component: () => import("@/pages/AllMusicPage.vue"),
    meta: {
      titleKey: "nav.allMusic",
      depth: 0,
    },
  },
];
