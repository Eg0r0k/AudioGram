import type { RouteRecordRaw } from "vue-router";
import { ROUTE_NAMES } from "@/app/router/route-names";

export const youtubeRoutes: RouteRecordRaw[] = [
  {
    path: "/youtube",
    name: ROUTE_NAMES.YOUTUBE,
    component: () => import("@/pages/YoutubePage.vue"),
    meta: {
      titleKey: "nav.youtube",
      depth: 1,
    },
  },
];
