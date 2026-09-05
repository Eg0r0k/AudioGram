<template>
  <div
    data-sidebar-header
    class="flex items-center shrink-0 pb-4"
    :class="compact ? 'justify-center px-2' : 'gap-3 px-4'"
  >
    <div class="relative size-10 shrink-0">
      <AnimatePresence :initial="false">
        <Motion
          v-if="isSearchOpen"
          key="back"
          class="absolute inset-0"
          :initial="{ opacity: 0, rotate: -60, scale: 0.7 }"
          :animate="{ opacity: 1, rotate: 0, scale: 1 }"
          :exit="{ opacity: 0, rotate: -60, scale: 0.7 }"
          :transition="headerTransition"
        >
          <Button
            variant="ghost"
            size="icon-lg"
            class="rounded-full"
            @click="handleClose"
          >
            <IconArrowLeft class="size-6" />
          </Button>
        </Motion>

        <Motion
          v-else
          key="menu"
          class="absolute inset-0"
          :initial="{ opacity: 0, rotate: 60, scale: 0.7 }"
          :animate="{ opacity: 1, rotate: 0, scale: 1 }"
          :exit="{ opacity: 0, rotate: 60, scale: 0.7 }"
          :transition="headerTransition"
        >
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="icon-lg"
                class="relative rounded-full"
                :aria-label="$t('nav.menu')"
              >
                <ImportRing />
                <IconDownload
                  v-if="hasActiveDownloads"
                  class="size-6 animate-pulse text-primary"
                />
                <IconMenu2
                  v-else
                  class="size-6"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              class="w-52 bg-popover/50 backdrop-blur-[50px]"
              align="start"
            >
              <DropdownMenuGroup>
                <DropdownMenuItem @click="goFavorite">
                  <IconBookmark class="size-5.5" />
                  {{ t("nav.favorite") }}
                </DropdownMenuItem>

                <DropdownMenuItem @click="goStats">
                  <IconChartBar class="size-5.5" />
                  {{ t("nav.stats") }}
                </DropdownMenuItem>

                <DropdownMenuItem @click="goSettings">
                  <IconSettings class="size-5.5" />
                  {{ t("nav.settings") }}
                </DropdownMenuItem>

                <DropdownMenuItem @click="openDownloadsPanel">
                  <IconDownload class="size-5.5" />
                  {{ t("nav.downloads") }}
                  <span
                    v-if="hasActiveDownloads"
                    class="ml-auto text-xs text-primary"
                  >{{ activeDownloadsCount }}</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  v-if="importOpen"
                  @click="openImportPanel"
                >
                  <IconFileImport class="size-5.5" />
                  {{ t("common.import.panelTitle") }}
                  <span
                    class="ml-auto text-xs"
                    :class="importErrorCount > 0 && !importRunning ? 'text-destructive' : 'text-primary'"
                  >{{ importMenuStatus }}</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem @click="handleThemeToggle">
                  <component
                    :is="themeIcon"
                    class="size-5.5"
                  />
                  {{ t("nav.changeTheme") }}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Motion>
      </AnimatePresence>
    </div>
    <div
      v-if="!compact"
      class="flex-1"
      @focusin="openSearch()"
    >
      <InputGroup class="bg-canvas! rounded-full h-10 flex-1">
        <InputGroupAddon tabindex="-1">
          <DropdownMenu v-if="searchSources.length > 1">
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                class="h-8 rounded-full px-1.5! gap-0.5 text-muted-foreground"
                :aria-label="$t(sourceUI(source).labelKey)"
                :title="$t(sourceUI(source).labelKey)"
              >
                <component
                  :is="triggerIcon"
                  class="size-5"
                />
                <IconChevronDown class="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              class="w-44"
              align="start"
            >
              <DropdownMenuItem
                v-for="ui in searchSources"
                :key="ui.kind"
                @click="selectSource(ui.kind)"
              >
                <component
                  :is="ui.icon"
                  class="size-5"
                />
                {{ $t(ui.labelKey) }}
                <IconCheck
                  v-if="source === ui.kind"
                  class="ml-auto size-4"
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <IconSearch
            v-else
            class="ml-1 mr-2 size-5"
          />
        </InputGroupAddon>
        <InputGroupInput
          ref="inputRef"
          v-model="query"
          autocomplete="off"
          class="pl-1! text-base!"
          :placeholder="$t('common.search')"
          @keydown.stop
          @keydown.escape="handleClose"
          @keydown.enter="handleEnter"
          @update:model-value="openSearch()"
        />
        <InputGroupAddon
          v-if="query.trim()"
          tabindex="-1"
          align="inline-end"
        >
          <Button
            class="rounded-full"
            variant="ghost-primary"
            size="icon-sm"
            @click="clear"
          >
            <IconX class="size-5" />
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </div>

    <AnimatePresence :initial="false">
      <Motion
        v-if="!isSearchOpen"
        v-show="!compact"
        key="page-source"
        class="shrink-0 overflow-hidden"
        :initial="{ width: 0, opacity: 0, marginLeft: '-0.75rem' }"
        :animate="{ width: 'auto', opacity: 1, marginLeft: '0rem' }"
        :exit="{ width: 0, opacity: 0, marginLeft: '-0.75rem' }"
        :transition="compact ? { duration: 0 } : headerTransition"
      >
        <PageSourceDropdown />
      </Motion>
    </AnimatePresence>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { AnimatePresence, Motion, useReducedMotion } from "motion-v";
import { useTheme } from "@/modules/settings/composables/useTheme";
import { useSearch, type SearchSource } from "@/modules/search/composables/useSearch";
import IconMenu2 from "~icons/tabler/menu-2";
import IconDownload from "~icons/tabler/download";
import IconFileImport from "~icons/tabler/file-import";
import IconArrowLeft from "~icons/tabler/arrow-left";
import IconBookmark from "~icons/tabler/bookmark";
import IconChartBar from "~icons/tabler/chart-bar";
import IconSettings from "~icons/tabler/settings";
import IconSearch from "~icons/tabler/search";
import IconX from "~icons/tabler/x";
import IconCheck from "~icons/tabler/check";
import IconChevronDown from "~icons/tabler/chevron-down";
import IconSun from "~icons/tabler/sun";
import IconMoon from "~icons/tabler/moon";
import { routeLocation } from "@/app/router/route-locations";
import PageSourceDropdown from "@/modules/sources/components/PageSourceDropdown.vue";
import ImportRing from "@/components/layout/sidebar/header/ImportRing.vue";
import { useImport } from "@/modules/library/composables/useImport";
import { sources } from "@/modules/sources";
import { sourceUI } from "@/modules/sources/lib/source-ui";
import { useDownloadsStore } from "@/modules/downloads/store/downloads.store";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { getLogger } from "@/lib/logger";

defineProps<{ compact?: boolean }>();

const { t } = useI18n();
const router = useRouter();
const theme = useTheme();
const prefersReduced = useReducedMotion();

const headerTransition = computed(() =>
  prefersReduced.value
    ? { duration: 0 }
    : { duration: 0.3, ease: [0.23, 1, 0.32, 1] as const },
);

const { query, source, setSource, isSearchOpen, openSearch, closeSearch, submitYtSearch, clear, focusRequests }
  = useSearch();

// `ref="inputRef"` in the template had no declaration behind it, so nothing
// could reach the field. Declared here so a focus request can land on it.
const inputRef = ref<HTMLInputElement | { $el?: HTMLElement } | null>(null);

watch(focusRequests, async () => {
  openSearch();
  // The panel needs a tick to render before the field can take focus.
  await nextTick();
  const target = inputRef.value;
  const root = target instanceof HTMLElement ? target : target?.$el;
  const field = root instanceof HTMLInputElement ? root : root?.querySelector("input");
  field?.focus();
});

const searchSources = computed(() => sources.searchable().map(sourceUI));

// The trigger sits inside the search field, where the magnifier is the
// affordance for "this is a search box". Only once a remote source is picked
// does the icon switch to naming that source.
const triggerIcon = computed(() =>
  (source.value === "local" ? IconSearch : sourceUI(source.value).icon),
);

const downloads = useDownloadsStore();
const rightPanel = useRightPanelStore();
const activeDownloadsCount = computed(() => Object.keys(downloads.jobs).length);
const hasActiveDownloads = computed(() => activeDownloadsCount.value > 0);

function openDownloadsPanel() {
  rightPanel.openDownloads();
}

const {
  isOpen: importOpen,
  isRunning: importRunning,
  current: importCurrent,
  total: importTotal,
  errorCount: importErrorCount,
} = useImport();

const importMenuStatus = computed(() => {
  if (importRunning.value) return t("common.import.progressLabel", { current: importCurrent.value, total: importTotal.value });
  if (importErrorCount.value > 0) return t("common.import.menu.issues", { count: importErrorCount.value });
  return t("common.import.menu.done");
});

const openImportPanel = () => {
  rightPanel.openImport();
};

function selectSource(next: SearchSource) {
  setSource(next);
  openSearch();
}

function handleEnter() {
  if (source.value === "yt") submitYtSearch();
}

const themeIcon = computed(() => (theme.isDark.value ? IconSun : IconMoon));

function handleThemeToggle(event: MouseEvent) {
  theme.toggleTheme(event)
    .catch(error => getLogger().error(`[SidebarHeader] Theme toggle failed: ${String(error)}`));
}

function goFavorite() {
  router.push(routeLocation.liked())
    .catch(error => getLogger().error(`[SidebarHeader] Navigation to liked failed: ${String(error)}`));
}

function goSettings() {
  router.push(routeLocation.settings())
    .catch(error => getLogger().error(`[SidebarHeader] Navigation to settings failed: ${String(error)}`));
}

function goStats() {
  router.push(routeLocation.settingsStats())
    .catch(error => getLogger().error(`[SidebarHeader] Navigation to stats failed: ${String(error)}`));
}

function handleClose() {
  closeSearch();
  clear();
}
</script>
