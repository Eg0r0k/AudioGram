<template>
  <Scrollable
    direction="vertical"
    class="flex-1"
  >
    <div class="pb-8">
      <SettingsHeader :title="$t('settings.index.title')" />

      <SettingsGroup>
        <SettingsLink
          :to="routeLocation.settingsGeneral()"
          :icon="IconSettings"
          :title="$t('settings.index.general')"
        />
        <SettingsLink
          :to="routeLocation.settingsAppearance()"
          :icon="IconPalette"
          :title="$t('settings.index.appearance')"
        />
        <SettingsLink
          :to="routeLocation.settingsLanguage()"
          :icon="IconLanguage"
          :title="$t('settings.index.language')"
          :subtitle="language"
        />
      </SettingsGroup>

      <SettingsGroup class=" mt-3">
        <SettingsLink
          :to="routeLocation.settingsAudio()"
          :icon="IconHeadphones"
          :title="$t('settings.index.audio')"
        />
        <SettingsLink
          :to="routeLocation.settingsStorage()"
          :icon="IconDatabase"
          :title="$t('settings.index.storage')"
        />
        <SettingsLink
          v-if="isTauri"
          :to="routeLocation.settingsProxy()"
          :icon="IconWorld"
          :title="$t('settings.index.proxy')"
        />
        <!-- <SettingsLink
          :to="routeLocation.settingsNotifications()"
          :icon="IconBell"
          :title="$t('settings.index.notifications')"
        /> -->
      </SettingsGroup>

      <SettingsGroup class="mt-3">
        <SettingsLink
          :to="routeLocation.settingsAbout()"
          :icon="IconInfo"
          :title="$t('settings.index.about')"
        />
      </SettingsGroup>

      <SettingsGroup class="mt-3">
        <div class="px-4 py-3">
          <div class="mb-1 text-primary font-medium">
            {{ $t("settings.index.resetAll") }}
          </div>
          <div class="text-sm text-muted-foreground">
            {{ $t("settings.index.resetAllDescription") }}
          </div>
        </div>

        <Button
          class="w-full h-14 justify-start  "
          size="xl"
          variant="ghost-primary"
          @click="handleResetAllSettings"
        >
          <IconRefresh class="size-6" />
          {{ $t("settings.index.resetAllAction") }}
        </Button>
      </SettingsGroup>
    </div>
  </Scrollable>
</template>

<script setup lang="ts">
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { Scrollable } from "@/components/ui/scrollable";
import IconSettings from "~icons/tabler/settings";
import IconPalette from "~icons/tabler/palette";
import IconLanguage from "~icons/tabler/language";
import IconHeadphones from "~icons/tabler/headphones";
import IconDatabase from "~icons/tabler/database";
import IconInfo from "~icons/tabler/info-circle";
import IconWorld from "~icons/tabler/world";
import IconRefresh from "~icons/tabler/refresh";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import SettingsLink from "@/modules/settings/components/SettingsLink.vue";
import { useGeneralSettings } from "@/modules/settings/store/general";
import SettingsHeader from "@/modules/settings/components/SettingsHeader.vue";
import { useSettingsStore } from "@/modules/settings/store";
import { useAudioSettingsStore } from "@/modules/settings/store/audio";
import { useTheme } from "@/modules/settings/composables/useTheme";
import { useAccentColor } from "@/modules/settings/composables/useAccentColor";
import { useZoom } from "@/modules/settings/composables/useZoom";
import { routeLocation } from "@/app/router/route-locations";
import { IS_TAURI } from "@/lib/environment/userAgent";

const { language } = useGeneralSettings();
const { t } = useI18n();
const settingsStore = useSettingsStore();
const audioSettingsStore = useAudioSettingsStore();
const { changeTheme } = useTheme();
const { resetAccentColor } = useAccentColor();
const { resetZoom } = useZoom();
const isTauri = IS_TAURI;

const handleResetAllSettings = () => {
  settingsStore.reset();
  audioSettingsStore.reset();
  changeTheme("system");
  resetAccentColor();
  resetZoom();
  toast.success(t("settings.index.resetAllDone"));
};

</script>
