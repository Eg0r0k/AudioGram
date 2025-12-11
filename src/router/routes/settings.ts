import type { RouteRecordRaw } from "vue-router";

export const settingsRoutes: RouteRecordRaw[] = [
  {
    path: "/settings",
    name: "settings",
    component: () => import("@/pages/settings/SettingsPage.vue"),
    meta: {
      titleKey: "nav.settings",
      showInNav: false,
    },
  },
  {
    path: "/settings/general",
    name: "settings-general",
    component: () => import("@/pages/settings/GeneralSettings.vue"),
    meta: {
      titleKey: "settings.general",
    },
  },
  {
    path: "/settings/audio",
    name: "settings-audio",
    component: () => import("@/pages/settings/AudioSettings.vue"),
    meta: {
      titleKey: "settings.audio",
    },
  },
  {
    path: "/settings/storage",
    name: "settings-storage",
    component: () => import("@/pages/settings/StorageSettings.vue"),
    meta: {
      titleKey: "settings.storage",
    },
  },
  {
    path: "/settings/language",
    name: "settings-language",
    component: () => import("@/pages/settings/LanguageSettings.vue"),
    meta: {
      titleKey: "settings.language",
    },
  },
  {
    path: "/settings/notifications",
    name: "settings-notifications",
    component: () => import("@/pages/settings/NotificationsSettings.vue"),
    meta: {
      titleKey: "settings.notifications",
    },
  },
  {
    path: "/settings/appearance",
    name: "settings-appearance",
    component: () => import("@/pages/settings/AppearanceSettings.vue"),
    meta: {
      titleKey: "settings.appearance",
    },
  },
  {
    path: "/settings/about",
    name: "settings-about",
    component: () => import("@/pages/settings/AboutSettings.vue"),
    meta: {
      titleKey: "settings.about",
    },
  },
];
