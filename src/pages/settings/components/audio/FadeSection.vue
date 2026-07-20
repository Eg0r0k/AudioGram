<!-- eslint-disable vuejs-accessibility/form-control-has-label -->
<template>
  <SettingsGroup class="mt-2">
    <Item @click="setFadeEnabled(!isFadeEnabled)">
      <ItemContent>
        <ItemTitle>{{ $t('settings.audio.fade') }}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <Switch
          :model-value="isFadeEnabled"
          @click.stop
          @update:model-value="setFadeEnabled"
        />
      </ItemActions>
    </Item>

    <div
      class="px-4 py-4 space-y-5 transition-opacity duration-300"
      :class="{ 'opacity-40 pointer-events-none': !isFadeEnabled }"
    >
      <div class="space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-foreground  font-medium">{{ $t("settings.audio.fadeIn") }}</span>
          <span class=" font-medium text-muted-foreground">
            {{ fadeInDuration.toFixed(1) }}s
          </span>
        </div>
        <Slider
          :model-value="[fadeInDuration]"
          :min="0"
          :max="10"
          :step="0.1"
          @update:model-value="(val) => setFadeInDuration(val![0])"
        />
      </div>

      <div class="space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-foreground  font-medium">{{ $t("settings.audio.fadeOut") }}</span>
          <span class=" font-medium text-muted-foreground">
            {{ fadeOutDuration.toFixed(1) }}s
          </span>
        </div>
        <Slider
          :model-value="[fadeOutDuration]"
          :min="0"
          :max="10"
          :step="0.1"
          @update:model-value="(val) => setFadeOutDuration(val![0])"
        />
      </div>
    </div>
  </SettingsGroup>
</template>

<script setup lang="ts">
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";

import { useAudioSettings } from "@/modules/settings/composables/useAudioSettings";

const {
  isFadeEnabled,
  fadeInDuration,
  fadeOutDuration,
  setFadeEnabled,
  setFadeInDuration,
  setFadeOutDuration,
} = useAudioSettings();
</script>
