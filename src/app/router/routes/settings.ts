import type { RouteRecordRaw } from "vue-router";
import { ROUTE_NAMES } from "@/app/router/route-names";

export const settingsRoutes: RouteRecordRaw[] = [
  {
    path: "/settings",
    name: ROUTE_NAMES.SETTINGS,
    component: () => import("@/pages/settings/SettingsPage.vue"),
    meta: {
      titleKey: "nav.settings",
      depth: 3,
    },
  },
  {
    path: "/settings/general",
    name: ROUTE_NAMES.SETTINGS_GENERAL,
    component: () => import("@/pages/settings/GeneralSettings.vue"),
    meta: {
      titleKey: "settings.general",
      depth: 4,
    },
  },
  {
    path: "/settings/audio",
    name: ROUTE_NAMES.SETTINGS_AUDIO,
    component: () => import("@/pages/settings/AudioSettings.vue"),
    meta: {
      titleKey: "settings.audio",
      depth: 4,
    },
  },
  {
    path: "/settings/storage",
    name: ROUTE_NAMES.SETTINGS_STORAGE,
    component: () => import("@/pages/settings/StorageSettings.vue"),
    meta: {
      titleKey: "settings.storage",
      depth: 4,
    },
  },
  {
    path: "/settings/language",
    name: ROUTE_NAMES.SETTINGS_LANGUAGE,
    component: () => import("@/pages/settings/LanguageSettings.vue"),
    meta: {
      titleKey: "settings.language",
      depth: 4,
    },
  },
  {
    path: "/settings/notifications",
    name: ROUTE_NAMES.SETTINGS_NOTIFICATIONS,
    component: () => import("@/pages/settings/NotificationsSettings.vue"),
    meta: {
      titleKey: "settings.notifications",
      depth: 4,
    },
  },
  {
    path: "/settings/appearance",
    name: ROUTE_NAMES.SETTINGS_APPEARANCE,
    component: () => import("@/pages/settings/AppearanceSettings.vue"),
    meta: {
      titleKey: "settings.appearance",
      depth: 4,
    },
  },
  {
    path: "/settings/about",
    name: ROUTE_NAMES.SETTINGS_ABOUT,
    component: () => import("@/pages/settings/AboutSettings.vue"),
    meta: {
      titleKey: "settings.about",
      depth: 4,
    },
  },
  {
    path: "/settings/about/terms",
    name: ROUTE_NAMES.SETTINGS_TERMS,
    component: () => import("@/pages/settings/TermsOfServiceSettings.vue"),
    meta: {
      titleKey: "settings.about.termsOfService",
      depth: 5,
    },
  },
  {
    path: "/settings/about/privacy",
    name: ROUTE_NAMES.SETTINGS_PRIVACY,
    component: () => import("@/pages/settings/PrivacyPolicySettings.vue"),
    meta: {
      titleKey: "settings.about.privacyPolicy",
      depth: 5,
    },
  },
];
