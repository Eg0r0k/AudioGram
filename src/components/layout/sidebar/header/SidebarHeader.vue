<template>
  <div
    data-sidebar-header
    class="flex items-center shrink-0 pb-4"
    :class="compact ? 'justify-center px-2' : 'gap-3 px-4'"
  >
    <Transition
      enter-active-class="transition-[opacity,transform] duration-200 ease-standard"
      enter-from-class="opacity-0 scale-75 rotate-[-90deg]"
      leave-active-class="transition-[opacity,transform] duration-150 ease-standard"
      leave-to-class="opacity-0 scale-75 rotate-[90deg]"
      mode="out-in"
    >
      <Button
        v-if="isSearchOpen"
        key="back"
        variant="ghost"
        size="icon-lg"
        class="rounded-full shrink-0"
        @click="handleClose"
      >
        <IconArrowLeft class="size-6" />
      </Button>

      <div
        v-else
        key="menu"
        class="shrink-0"
      >
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="icon-lg"
              class="rounded-full"
              :aria-label="$t('nav.menu')"
            >
              <!-- An active download takes over the burger: the header is the
                   always-visible hint that the queue is working. -->
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
      </div>
    </Transition>
    <div
      v-if="!compact"
      class="flex-1"
      @focusin="openSearch"
    >
      <InputGroup class="dark:bg-background!  bg-muted! rounded-full h-10 flex-1">
        <InputGroupAddon tabindex="-1">
          <DropdownMenu v-if="isYoutubeAvailable || isNdSearchAvailable">
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                class="h-8 rounded-full px-1.5! gap-0.5 text-muted-foreground"
                :aria-label="$t(`search.source.${source}`)"
                :title="$t(`search.source.${source}`)"
              >
                <IconBrandYoutube
                  v-if="source === 'youtube'"
                  class="size-5"
                />
                <IconServer
                  v-else-if="source === 'nd'"
                  class="size-5"
                />
                <IconSearch
                  v-else
                  class="size-5"
                />
                <IconChevronDown class="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              class="w-44"
              align="start"
            >
              <DropdownMenuItem @click="selectSource('library')">
                <IconSearch class="size-5" />
                {{ $t("search.source.library") }}
                <IconCheck
                  v-if="source === 'library'"
                  class="ml-auto size-4"
                />
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="isYoutubeAvailable"
                @click="selectSource('youtube')"
              >
                <IconBrandYoutube class="size-5" />
                {{ $t("search.source.youtube") }}
                <IconCheck
                  v-if="source === 'youtube'"
                  class="ml-auto size-4"
                />
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="isNdSearchAvailable"
                @click="selectSource('nd')"
              >
                <IconServer class="size-5" />
                {{ $t("search.source.nd") }}
                <IconCheck
                  v-if="source === 'nd'"
                  class="ml-auto size-4"
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <IconSearch
            v-else
            class="ml-1 size-5"
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
          @update:model-value="openSearch"
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

    <!-- Library-pages source (local/nd) — a separate axis from the search
         source switcher inside the input above. -->
    <PageSourceDropdown v-if="!compact && !isSearchOpen" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
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
import { useTheme } from "@/modules/settings/composables/useTheme";
import { useSearch, type SearchSource } from "@/modules/search/composables/useSearch";
import IconMenu2 from "~icons/tabler/menu-2";
import IconDownload from "~icons/tabler/download";
import IconArrowLeft from "~icons/tabler/arrow-left";
import IconBookmark from "~icons/tabler/bookmark";
import IconSettings from "~icons/tabler/settings";
import IconSearch from "~icons/tabler/search";
import IconX from "~icons/tabler/x";
import IconCheck from "~icons/tabler/check";
import IconChevronDown from "~icons/tabler/chevron-down";
import IconSun from "~icons/tabler/sun";
import IconMoon from "~icons/tabler/moon";
import { routeLocation } from "@/app/router/route-locations";
import { youtubeProvider } from "@/modules/youtube/provider";
import IconBrandYoutube from "~icons/tabler/brand-youtube";
import PageSourceDropdown from "@/modules/sources/components/PageSourceDropdown.vue";
import IconServer from "~icons/tabler/server";
import { getNdConfig } from "@/modules/sources/navidrome/config";
import { useDownloadsStore } from "@/modules/downloads/store/downloads.store";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";

defineProps<{ compact?: boolean }>();

const { t } = useI18n();
const router = useRouter();
const theme = useTheme();

const { query, source, setSource, isSearchOpen, openSearch, closeSearch, submitYtSearch, clear } = useSearch();

const isYoutubeAvailable = youtubeProvider.isAvailable;
const isNdSearchAvailable = computed(() => getNdConfig() !== null);

const downloads = useDownloadsStore();
const rightPanel = useRightPanelStore();
const activeDownloadsCount = computed(() => Object.keys(downloads.jobs).length);
const hasActiveDownloads = computed(() => activeDownloadsCount.value > 0);

function openDownloadsPanel() {
  rightPanel.openDownloads();
}

function selectSource(next: SearchSource) {
  setSource(next);
  openSearch();
}

function handleEnter() {
  if (source.value === "youtube") submitYtSearch();
}

const themeIcon = computed(() => (theme.isDark.value ? IconSun : IconMoon));

function handleThemeToggle(event: MouseEvent) {
  theme.toggleTheme(event);
}

function goFavorite() {
  router.push(routeLocation.liked());
}

function goSettings() {
  router.push(routeLocation.settings());
}

function handleClose() {
  closeSearch();
  clear();
}
</script>
