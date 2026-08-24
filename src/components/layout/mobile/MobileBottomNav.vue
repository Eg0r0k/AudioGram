<template>
  <nav
    :aria-label="t('nav.menu')"
    class="flex items-stretch justify-around bg-card  gap-0.5"
  >
    <template
      v-for="item in items"
      :key="item.key"
    >
      <Button
        v-if="item.to"
        as-child
        variant="ghost"
        class="h-auto min-w-0 flex-1 flex-col gap-0.5 py-2"
      >
        <Link
          :to="item.to"
          active-class="text-primary!"
        >
          <component
            :is="item.icon"
            class="size-6"
          />
          <span class="text-[11px] font-medium leading-none">{{ t(item.label) }}</span>
        </Link>
      </Button>
      <Button
        v-else
        variant="ghost"
        class="h-auto min-w-0 flex-1 flex-col gap-0.5 py-2"
        @click="item.action?.()"
      >
        <component
          :is="item.icon"
          class="size-6"
        />
        <span class="text-[11px] font-medium leading-none">{{ t(item.label) }}</span>
      </Button>
    </template>
  </nav>
</template>
<script setup lang="ts">
import type { Component } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import Link from "@/components/ui/link/Link.vue";
import { Button } from "@/components/ui/button";
import { routeLocation } from "@/app/router/route-locations";
import { useSearch } from "@/modules/search/composables/useSearch";

import IconHome from "~icons/tabler/home";
import IconSearch from "~icons/tabler/search";
import IconBookmark from "~icons/tabler/bookmark";
import IconLibrary from "~icons/tabler/library";
import IconSettings from "~icons/tabler/settings";

const { t } = useI18n();
const router = useRouter();
const { requestSearchFocus, closeSearch } = useSearch();

// Search has no page of its own — it lives in the sidebar the home route
// renders on mobile. So this entry goes home and asks that field for focus.
const goToSearch = async () => {
  await router.push(routeLocation.home());
  requestSearchFocus();
};

// Home shares its route with the search panel, so navigating to it from
// search would otherwise land on the panel rather than the home content.
const goHome = async () => {
  closeSearch();
  await router.push(routeLocation.home());
};

interface NavItem {
  key: string;
  label: string;
  icon: Component;
  to?: ReturnType<typeof routeLocation.home>;
  action?: () => void;
}

const items: NavItem[] = [
  { key: "home", label: "nav.home", icon: IconHome, action: goHome },
  { key: "search", label: "nav.search", icon: IconSearch, action: goToSearch },
  { key: "library", label: "nav.library", icon: IconLibrary, to: routeLocation.allMusic() },
  { key: "favorite", label: "nav.favorite", icon: IconBookmark, to: routeLocation.liked() },
  { key: "settings", label: "nav.settings", icon: IconSettings, to: routeLocation.settings() },
];
</script>
