import { RouteRecordRaw } from "vue-router";

export const searchRoutes: RouteRecordRaw[] = [
  {
    path: "/search",
    name: "search",
    component: () => import("@/pages/SearchPage.vue"),
    meta: {
      titleKey: "nav.search",
      showInNav: true,
      showInMobileNav: true,
      navOrder: 3,
    },
  },
];
