<!-- eslint-disable vuejs-accessibility/form-control-has-label -->
<template>
  <SettingsGroup class="mt-2">
    <Item @click="setNormalizationEnabled(!isNormalizationEnabled)">
      <ItemContent>
        <ItemTitle>{{ $t("settings.audio.normalization") }}</ItemTitle>
        <ItemDescription>
          {{ $t("settings.audio.normalizationDescription") }}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          :model-value="isNormalizationEnabled"
          @click.stop
          @update:model-value="setNormalizationEnabled"
        />
      </ItemActions>
    </Item>

    <div
      class=" space-y-5 transition-opacity duration-300"
      :class="{ 'opacity-40 pointer-events-none': !isNormalizationEnabled }"
    >
      <div class="px-4 py-4 mb-0 space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-foreground font-medium">{{ $t("settings.audio.targetLoudness") }}</span>
          <span class="font-medium text-muted-foreground">
            {{ normalizationTargetLufs }} LUFS
          </span>
        </div>
        <Slider
          :model-value="[normalizationTargetLufs]"
          :min="-24"
          :max="-6"
          :step="1"
          @update:model-value="(val) => setNormalizationTargetLufs(val![0])"
        />
      </div>

      <Item @click="setNormalizationPreventClipping(!normalizationPreventClipping)">
        <ItemContent>
          <ItemTitle>{{ $t("settings.audio.preventClipping") }}</ItemTitle>
        </ItemContent>
        <ItemActions>
          <Switch
            :model-value="normalizationPreventClipping"
            @click.stop
            @update:model-value="setNormalizationPreventClipping"
          />
        </ItemActions>
      </Item>
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

import ItemDescription from "@/components/ui/item/ItemDescription.vue";

const {
  isNormalizationEnabled,
  normalizationTargetLufs,
  normalizationPreventClipping,
  setNormalizationEnabled,
  setNormalizationTargetLufs,
  setNormalizationPreventClipping,
} = useAudioSettings();
</script>
