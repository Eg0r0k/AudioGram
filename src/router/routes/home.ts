import { RouteRecordRaw } from "vue-router";

export const homeRoutes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: () => import("@/pages/IndexPage.vue"),
    meta: {
      titleKey: "nav.home",
      showInNav: true,
      showInMobileNav: true,
      navOrder: 1,
    },
  },
];
