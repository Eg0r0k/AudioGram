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
              <IconMenu2 class="size-6" />
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

              <DropdownMenuItem
                v-if="isYoutubeAvailable"
                @click="goYoutube"
              >
                <IconBrandYoutube class="size-5.5" />
                {{ t("nav.youtube") }}
              </DropdownMenuItem>

              <DropdownMenuItem @click="goSettings">
                <IconSettings class="size-5.5" />
                {{ t("nav.settings") }}
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
          <IconSearch class="ml-1 size-5" />
        </InputGroupAddon>
        <InputGroupInput
          ref="inputRef"
          v-model="query"
          class="pl-4! text-base!"
          :placeholder="$t('common.search')"
          @keydown.stop
          @keydown.escape="handleClose"
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
import { useSearch } from "@/modules/search/composables/useSearch";
import IconMenu2 from "~icons/tabler/menu-2";
import IconArrowLeft from "~icons/tabler/arrow-left";
import IconBookmark from "~icons/tabler/bookmark";
import IconSettings from "~icons/tabler/settings";
import IconSearch from "~icons/tabler/search";
import IconX from "~icons/tabler/x";
import IconSun from "~icons/tabler/sun";
import IconMoon from "~icons/tabler/moon";
import { routeLocation } from "@/app/router/route-locations";
import { youtubeProvider } from "@/modules/youtube/provider";
import IconBrandYoutube from "~icons/tabler/brand-youtube";

defineProps<{ compact?: boolean }>();

const { t } = useI18n();
const router = useRouter();
const theme = useTheme();

const { query, isSearchOpen, openSearch, closeSearch, clear } = useSearch();

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

const isYoutubeAvailable = youtubeProvider.isAvailable;

function goYoutube() {
  router.push(routeLocation.youtube());
}

function handleClose() {
  closeSearch();
  clear();
}
</script>
