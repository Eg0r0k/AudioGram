import { RouteRecordRaw } from "vue-router";

export const albumRoutes: RouteRecordRaw[] = [
  {
    path: "/album",
    name: "album",
    component: () => import("@/pages/AlbumPage.vue"),
    meta: {
      titleKey: "nav.album",
      showInNav: false,
      showInMobileNav: false,
    },
  },
];
