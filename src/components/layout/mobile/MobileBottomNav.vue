<template>
  <nav
    :aria-label="t('nav.menu')"
    class="flex items-stretch justify-around bg-card pb-2 gap-1 px-2"
  >
    <Button
      v-for="item in items"
      :key="item.key"
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
  </nav>
</template>
<script setup lang="ts">
import { useI18n } from "vue-i18n";
import Link from "@/components/ui/link/Link.vue";
import { Button } from "@/components/ui/button";
import { routeLocation } from "@/app/router/route-locations";

import IconHome from "~icons/tabler/home";
import IconChartBar from "~icons/tabler/chart-bar";
import IconBookmark from "~icons/tabler/bookmark";
import IconSettings from "~icons/tabler/settings";

const { t } = useI18n();

const items = [
  { key: "home", label: "nav.home", icon: IconHome, to: routeLocation.home() },
  { key: "stats", label: "nav.stats", icon: IconChartBar, to: routeLocation.settingsStats() },
  { key: "favorite", label: "nav.favorite", icon: IconBookmark, to: routeLocation.liked() },
  { key: "settings", label: "nav.settings", icon: IconSettings, to: routeLocation.settings() },
];
</script>
