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
import { ref } from "vue";
import { Scrollable } from "@/components/ui/scrollable";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import SettingsHeader from "@/modules/settings/components/SettingsHeader.vue";
import { useGeneralSettings } from "@/modules/settings/store/general";

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

const isTogglingAutostart = ref(false);

const handleLaunchAtStartup = async (value: boolean) => {
  isTogglingAutostart.value = true;
  await setLaunchAtStartup(value);
  isTogglingAutostart.value = false;
};
</script>
