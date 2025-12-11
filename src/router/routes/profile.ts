import { RouteRecordRaw } from "vue-router";

export const profileRoutes: RouteRecordRaw[] = [
  {
    path: "/profile",
    name: "profile",
    component: () => import("@/pages/ProfilePage.vue"),
    meta: {
      titleKey: "nav.profile",
      showInNav: false,
    },
  },
];
