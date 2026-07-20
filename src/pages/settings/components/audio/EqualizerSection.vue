<!-- eslint-disable vuejs-accessibility/form-control-has-label -->
<template>
  <SettingsGroup>
    <Item @click="setEqEnabled(!isEqEnabled)">
      <ItemContent>
        <ItemTitle>{{ $t('player.equalizer') }}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <Switch
          :model-value="isEqEnabled"
          @click.stop
          @update:model-value="setEqEnabled"
        />
      </ItemActions>
    </Item>

    <div
      class="px-4 pb-4 pt-2 transition-[opacity,filter] duration-300 max-w-3xl mx-auto"
      :class="{ 'opacity-40 pointer-events-none grayscale': !isEqEnabled }"
    >
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <Select
            :model-value="currentPreset"
            @update:model-value="(val) => applyPreset(val as string)"
          >
            <SelectTrigger class="w-[180px] h-8 font-medium">
              <SelectValue :placeholder="$t('settings.audio.selectPreset')" />
            </SelectTrigger>
            <SelectContent class="max-h-[300px]">
              <SelectGroup
                v-for="(label, category) in presetCategories"
                :key="category"
              >
                <SelectLabel>{{ label }}</SelectLabel>
                <SelectItem
                  v-for="preset in getPresetsByCategory(category)"
                  :key="preset.name"
                  class="font-medium"
                  :value="preset.name"
                >
                  {{ preset.name }}
                </SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectItem value="custom">
                {{ $t("settings.audio.customPreset") }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          size="sm"
          variant="ghost-primary"
          @click="resetEqualizer"
        >
          <TrashIcon class="size-4.5" />

          {{ $t("settings.audio.resetEqualizer") }}
        </Button>
      </div>

      <div class="flex gap-4 h-48 select-none">
        <div class="flex flex-col justify-between py-2  font-medium text-muted-foreground/60 text-right w-6">
          <span>+15</span>
          <span>0</span>
          <span>-15</span>
        </div>

        <div class="grid grid-cols-10 gap-1.5 flex-1">
          <div
            v-for="(band, index) in bands"
            :key="band.frequency"
            class="flex flex-col items-center group relative h-full"
          >
            <EditableValue
              :model-value="band.gain"
              :min="-15"
              :max="15"
              :step="1"
              suffix=" dB"
              class="absolute -top-6 z-10 [&:focus-within>span]:opacity-100!"
              display-class="text-[11px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-background/80 px-1 rounded backdrop-blur-sm"
              input-class="text-[11px] w-[24px] text-center"
              @update:model-value="(val: string | number) => setBandGain(index, val as number)"
            />

            <VerticalSlider
              :model-value="band.gain"
              :min="-15"
              :max="15"
              :step="1"
              class="flex-1"
              @update:model-value="(val: string | number) => setBandGain(index, val as number)"
            />

            <span class="text-[10px] font-semibold text-muted-foreground mt-3">
              {{ formatFreq(band.frequency) }}
            </span>
          </div>
        </div>
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EditableValue } from "@/components/ui/editable";

import VerticalSlider from "@/modules/player/components/eq/VerticalSlider.vue";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";

import { Button } from "@/components/ui/button";
import { useAudioSettings } from "@/modules/settings/composables/useAudioSettings";

import TrashIcon from "~icons/tabler/trash";
import { formatFreq } from "@/lib/format";

const {
  isEqEnabled,
  currentPreset,
  bands,
  presetCategories,
  getPresetsByCategory,
  setBandGain,
  applyPreset,
  resetEqualizer,
  setEqEnabled,
} = useAudioSettings();
</script>
