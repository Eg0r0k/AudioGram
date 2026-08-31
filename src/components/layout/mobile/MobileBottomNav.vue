<template>
  <nav
    :aria-label="t('nav.menu')"
    class="flex h-14 items-stretch gap-1 p-1 mb-1 backdrop-blur-xl bg-muted rounded-lg"
  >
    <template
      v-for="item in items"
      :key="item.key"
    >
      <Button
        v-if="item.to"
        as-child
        variant="ghost"
        :class="itemClass(item)"
      >
        <Link :to="item.to">
          <component
            :is="isActive(item) ? item.activeIcon : item.icon"
            class="size-[22px]"
          />
          <span class="text-[10px] font-medium leading-none">{{ t(item.label) }}</span>
        </Link>
      </Button>
      <Button
        v-else
        variant="ghost"
        :class="itemClass(item)"
        :aria-current="isActive(item) ? 'page' : undefined"
        @click="item.action?.()"
      >
        <component
          :is="isActive(item) ? item.activeIcon : item.icon"
          class="size-[22px]"
        />
        <span class="text-[10px] font-medium leading-none">{{ t(item.label) }}</span>
      </Button>
    </template>
  </nav>
</template>
<script setup lang="ts">
import type { Component } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import Link from "@/components/ui/link/Link.vue";
import { Button } from "@/components/ui/button";
import { ROUTE_NAMES } from "@/app/router/route-names";
import { routeLocation } from "@/app/router/route-locations";
import { useSearch } from "@/modules/search/composables/useSearch";
import { getLogger } from "@/lib/logger";

import IconHome from "~icons/tabler/home";
import IconHomeFilled from "~icons/tabler/home-filled";
import IconSearch from "~icons/tabler/search";
import IconBookmark from "~icons/tabler/bookmark";
import IconBookmarkFilled from "~icons/tabler/bookmark-filled";
import IconLibrary from "~icons/tabler/library";
import IconLibraryFilled from "~icons/tabler/library-filled";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const { requestSearchFocus, closeSearch, isSearchOpen } = useSearch();

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
  /** Filled variant shown while the entry is the current one. */
  activeIcon: Component;
  active: () => boolean;
  to?: ReturnType<typeof routeLocation.home>;
  action?: () => void;
}

const isHomeRoute = () => route.name === ROUTE_NAMES.HOME;

const items: NavItem[] = [
  {
    key: "home",
    label: "nav.home",
    icon: IconHome,
    activeIcon: IconHomeFilled,
    active: () => isHomeRoute() && !isSearchOpen.value,
    action: () => {
      goHome().catch(error => getLogger().error(`[Nav] Going home failed: ${String(error)}`));
    },
  },
  {
    key: "search",
    label: "nav.search",
    icon: IconSearch,
    activeIcon: IconSearch,
    active: () => isHomeRoute() && isSearchOpen.value,
    action: () => {
      goToSearch().catch(error => getLogger().error(`[Nav] Opening search failed: ${String(error)}`));
    },
  },
  {
    key: "library",
    label: "nav.library",
    icon: IconLibrary,
    activeIcon: IconLibraryFilled,
    active: () => route.name === ROUTE_NAMES.ALL_MUSIC,
    to: routeLocation.allMusic(),
  },
  {
    key: "favorite",
    label: "nav.favorite",
    icon: IconBookmark,
    activeIcon: IconBookmarkFilled,
    active: () => route.name === ROUTE_NAMES.LIKED,
    to: routeLocation.liked(),
  },
];

const isActive = (item: NavItem) => item.active();

const itemClass = (item: NavItem) => [
  "h-auto min-w-0 flex-1 flex-col gap-1 rounded-xl py-1.5 rounded-md!",
  isActive(item) ? "text-primary" : "text-muted-foreground",
];
</script>
