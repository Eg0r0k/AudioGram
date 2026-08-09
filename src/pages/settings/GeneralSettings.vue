<template>
  <Scrollable
    direction="vertical"
    class="flex-1"
  >
    <div class="pb-8">
      <SettingsHeader :title="$t('settings.index.general')" />

      <SettingsGroup>
        <Item @click="setCheckUpdatesOnLaunch(!checkUpdatesOnLaunch)">
          <ItemContent>
            <ItemTitle>{{ $t('settings.general.checkUpdates') }}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <Switch
              :model-value="checkUpdatesOnLaunch"
              @click.stop
              @update:model-value="setCheckUpdatesOnLaunch"
            />
          </ItemActions>
        </Item>

        <Item @click="setAnalyzeTracks(!analyzeTracks)">
          <ItemContent>
            <ItemTitle>{{ $t('settings.general.analyzeTracks') }}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <Switch
              :model-value="analyzeTracks"
              @click.stop
              @update:model-value="setAnalyzeTracks"
            />
          </ItemActions>
        </Item>

        <Button
          class="w-full h-14 justify-start"
          size="xl"
          variant="ghost-primary"
          :class="{ 'text-destructive': updateStore.status === 'error' }"
          :disabled="updateStore.isBusy"
          :title="updateStore.error?.message"
          @click="updateStore.check()"
        >
          <IconLoader2
            v-if="updateStore.status === 'checking'"
            class="size-6 animate-spin"
          />
          <IconCheck
            v-else-if="updateStore.status === 'up-to-date'"
            class="size-6"
          />
          <IconAlertTriangle
            v-else-if="updateStore.status === 'error'"
            class="size-6"
          />
          <IconCloudDownload
            v-else
            class="size-6"
          />
          {{ checkStateLabel }}
        </Button>
      </SettingsGroup>

      <template v-if="isTauri">
        <SettingsGroup class="mt-2">
          <Item @click="setLaunchAtStartup(!launchAtStartup)">
            <ItemContent>
              <ItemTitle>{{ $t('settings.general.launchAtStartup') }}</ItemTitle>
            </ItemContent>
            <ItemActions>
              <Switch
                :model-value="launchAtStartup"
                :disabled="isTogglingAutostart"
                @click.stop
                @update:model-value="handleLaunchAtStartup"
              />
            </ItemActions>
          </Item>

          <Item
            :class="{ 'opacity-40 pointer-events-none': !launchAtStartup }"
            @click="setLaunchMinimized(!launchMinimized)"
          >
            <ItemContent>
              <ItemTitle>{{ $t('settings.general.launchMinimized') }}</ItemTitle>
            </ItemContent>
            <ItemActions>
              <Switch
                :model-value="launchMinimized"
                @click.stop
                @update:model-value="setLaunchMinimized"
              />
            </ItemActions>
          </Item>

          <Item @click="setCloseToTray(!closeToTray)">
            <ItemContent>
              <ItemTitle>{{ $t('settings.general.closeToTray') }}</ItemTitle>
            </ItemContent>
            <ItemActions>
              <Switch
                :model-value="closeToTray"
                @click.stop
                @update:model-value="setCloseToTray"
              />
            </ItemActions>
          </Item>
        </SettingsGroup>
      </template>
    </div>
  </Scrollable>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Scrollable } from "@/components/ui/scrollable";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import IconLoader2 from "~icons/tabler/loader-2";
import IconCloudDownload from "~icons/tabler/cloud-download";
import IconCheck from "~icons/tabler/check";
import IconAlertTriangle from "~icons/tabler/alert-triangle";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import SettingsHeader from "@/modules/settings/components/SettingsHeader.vue";
import { useGeneralSettings } from "@/modules/settings/store/general";
import { useUpdateStore } from "@/modules/update/store/update.store";

const {
  checkUpdatesOnLaunch,
  analyzeTracks,
  closeToTray,
  launchAtStartup,
  launchMinimized,
  isTauri,
  setCheckUpdatesOnLaunch,
  setAnalyzeTracks,
  setCloseToTray,
  setLaunchAtStartup,
  setLaunchMinimized,
} = useGeneralSettings();

const { t } = useI18n();
const updateStore = useUpdateStore();

/**
 * The button carries its own state: label and icon swap with the check
 * status (full error text lives in the title tooltip). An available update
 * is not reported here — the sidebar update button owns that, and it stays
 * until the user acts on it.
 */
const checkStateLabel = computed(() => {
  switch (updateStore.status) {
    case "checking":
      return t("update.checking");
    case "up-to-date":
      return t("update.upToDate");
    case "error":
      return t("update.updaterError");
    default:
      return t("update.checkForUpdates");
  }
});

const isTogglingAutostart = ref(false);

const handleLaunchAtStartup = async (value: boolean) => {
  isTogglingAutostart.value = true;
  await setLaunchAtStartup(value);
  isTogglingAutostart.value = false;
};
</script>
