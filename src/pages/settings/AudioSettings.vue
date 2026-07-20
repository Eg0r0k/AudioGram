<template>
  <Scrollable
    direction="vertical"
    class="flex-1"
  >
    <div class="pb-8">
      <SettingsHeader :title="$t('settings.index.audio')" />

      <EqualizerSection />

      <FadeSection />

      <NormalizationSection />
    </div>
  </Scrollable>
</template>

<script setup lang="ts">
import { Scrollable } from "@/components/ui/scrollable";

import SettingsHeader from "@/modules/settings/components/SettingsHeader.vue";

import EqualizerSection from "./components/audio/EqualizerSection.vue";
import FadeSection from "./components/audio/FadeSection.vue";
import NormalizationSection from "./components/audio/NormalizationSection.vue";
</script>
