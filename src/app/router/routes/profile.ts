import { RouteRecordRaw } from "vue-router";
import { ROUTE_NAMES } from "@/app/router/route-names";

export const profileRoutes: RouteRecordRaw[] = [
  {
    path: "/profile",
    name: ROUTE_NAMES.PROFILE,
    component: () => import("@/pages/ProfilePage.vue"),
    meta: {
      titleKey: "nav.profile",
      depth: 1,
    },
  },
];
