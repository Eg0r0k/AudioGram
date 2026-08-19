<template>
  <Scrollable
    direction="vertical"
    class="flex-1"
  >
    <div class="pb-8">
      <SettingsHeader :title="$t('settings.index.appearance')" />

      <SettingsGroup>
        <div class="px-4">
          <div class=" text-primary font-medium mb-1">
            {{ $t("settings.appearance.colorTheme") }}
          </div>
        </div>
        <RadioGroup
          :model-value="theme"
          @update:model-value="(val) => setTheme(val as any)"
        >
          <Item
            v-for="option in themes"
            :key="option.value"
            class="cursor-pointer"
            @click="setTheme(option.value)"
          >
            <RadioGroupItem
              :id="`theme-${option.value}`"
              :value="option.value"
            />
            <ItemContent>
              <ItemTitle>
                {{ $t(`settings.appearance.themes.${option.value}`) }}
              </ItemTitle>
            </ItemContent>
          </Item>
        </RadioGroup>
      </SettingsGroup>

      <SettingsGroup>
        <div class="px-4 py-4">
          <div class="mb-3 text-primary font-medium">
            {{ $t("settings.appearance.accentColor") }}
          </div>
          <AccentColorPicker
            :model-value="accentColor"
            :colors="accentColors"
            :custom-color="customAccentColor"
            @select="setAccentColor"
            @select-custom="setCustomAccentColor"
          />
        </div>
      </SettingsGroup>

      <template v-if="platformCaps.hasZoom">
        <SettingsGroup class="mt-2">
          <Item>
            <ItemContent>
              <ItemTitle>{{ $t("settings.appearance.zoom") }}</ItemTitle>
            </ItemContent>
            <ItemActions>
              <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -- renderless reka root, the trigger below carries the label -->
              <Select
                :model-value="String(zoom)"
                @update:model-value="(val) => setZoom(Number(val) as any)"
              >
                <SelectTrigger
                  class="w-[90px] h-8 font-medium pointer-events-auto"
                  :aria-label="$t('settings.appearance.zoom')"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="level in zoomLevels"
                    :key="level"
                    :value="String(level)"
                  >
                    {{ level }}%
                  </SelectItem>
                </SelectContent>
              </Select>
            </ItemActions>
          </Item>
        </SettingsGroup>
      </template>
    </div>
  </Scrollable>
</template>

<script setup lang="ts">
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@/components/ui/item";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Scrollable } from "@/components/ui/scrollable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AccentColorPicker from "@/modules/settings/components/AccentColorPicker.vue";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import SettingsHeader from "@/modules/settings/components/SettingsHeader.vue";
import { useAppearanceSettings } from "@/modules/settings/store/appearance";
import { useZoom } from "@/modules/settings/composables/useZoom";
import { platformCaps } from "@/lib/environment/platformCaps";

const {
  theme, themes, setTheme,
  accentColor, accentColors, setAccentColor,
  customAccentColor, setCustomAccentColor,
} = useAppearanceSettings();

const {
  zoom, zoomLevels, setZoom,
} = useZoom();

</script>
