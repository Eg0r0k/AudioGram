import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import {
  EQ_FREQUENCIES,
  EQ_PRESETS,
  EQ_PRESET_CATEGORIES,
  FADE_DURATION_MIN,
  FADE_DURATION_MAX,
  FADE_DURATION_DEFAULT,
  NORMALIZATION_TARGET_LUFS_MIN,
  NORMALIZATION_TARGET_LUFS_MAX,
  NORMALIZATION_TARGET_LUFS_DEFAULT,
  getPresetsByCategory,
  type EQPresetKey,
} from "../schema/audio";

export interface EQBand {
  frequency: number;
  gain: number;
}

export const useAudioSettingsStore = defineStore("audio-settings", () => {
  const isEqEnabled = ref(true);
  const currentPreset = ref<EQPresetKey>("Flat");
  const bandGains = ref<number[]>(Array.from({ length: 10 }, () => 0));

  const isFadeEnabled = ref(false);
  const fadeInDuration = ref(FADE_DURATION_DEFAULT);
  const fadeOutDuration = ref(FADE_DURATION_DEFAULT);

  const isNormalizationEnabled = ref(false);
  const normalizationTargetLufs = ref(NORMALIZATION_TARGET_LUFS_DEFAULT);
  const normalizationPreventClipping = ref(true);

  const bands = computed<EQBand[]>(() =>
    EQ_FREQUENCIES.map((f, i) => ({
      frequency: f,
      gain: bandGains.value[i] ?? 0,
    })),
  );

  function pushToGraph() {
    const playerStore = usePlayerStore();
    const graph = playerStore.getAudioGraph();
    if (!graph) return;

    if (graph.eqEnabled !== isEqEnabled.value) {
      graph.setEQEnabled(isEqEnabled.value);
    }

    bandGains.value.forEach((gain, i) => {
      if (Math.abs(graph.getEQBand(i) - gain) > 0.01) {
        graph.setEQBand(i, gain);
      }
    });
  }

  function pushNormalizationToPlayer() {
    const playerStore = usePlayerStore();
    const player = playerStore.player;

    if (!player) return;

    player.setNormalizationOptions({
      enabled: isNormalizationEnabled.value,
      targetLufs: normalizationTargetLufs.value,
      preventClipping: normalizationPreventClipping.value,
    });
  }

  function setBandGain(index: number, gain: number) {
    if (index >= 0 && index < bandGains.value.length) {
      bandGains.value[index] = gain;
      currentPreset.value = "custom";
      pushToGraph();
    }
  }

  function applyPreset(presetName?: string) {
    const name = presetName ?? currentPreset.value;
    if (!(name in EQ_PRESETS)) return;
    const preset = EQ_PRESETS[name as keyof typeof EQ_PRESETS];

    currentPreset.value = name as EQPresetKey;
    preset.gains.forEach((gain, i) => {
      bandGains.value[i] = gain;
    });

    pushToGraph();
  }

  function resetEqualizer() {
    currentPreset.value = "Flat";
    applyPreset("Flat");
  }

  function setEqEnabled(enabled: boolean) {
    isEqEnabled.value = enabled;
    pushToGraph();
  }

  function setFadeEnabled(enabled: boolean) {
    isFadeEnabled.value = enabled;
  }

  function setFadeInDuration(duration: number) {
    fadeInDuration.value = Math.max(
      FADE_DURATION_MIN,
      Math.min(FADE_DURATION_MAX, duration),
    );
  }

  function setFadeOutDuration(duration: number) {
    fadeOutDuration.value = Math.max(
      FADE_DURATION_MIN,
      Math.min(FADE_DURATION_MAX, duration),
    );
  }

  function setNormalizationEnabled(enabled: boolean) {
    isNormalizationEnabled.value = enabled;
    pushNormalizationToPlayer();
  }

  function setNormalizationTargetLufs(value: number) {
    normalizationTargetLufs.value = Math.max(
      NORMALIZATION_TARGET_LUFS_MIN,
      Math.min(NORMALIZATION_TARGET_LUFS_MAX, value),
    );
    pushNormalizationToPlayer();
  }

  function setNormalizationPreventClipping(enabled: boolean) {
    normalizationPreventClipping.value = enabled;
    pushNormalizationToPlayer();
  }

  function reset() {
    isEqEnabled.value = true;
    currentPreset.value = "Flat";
    bandGains.value = Array.from({ length: 10 }, () => 0);
    isFadeEnabled.value = false;
    fadeInDuration.value = FADE_DURATION_DEFAULT;
    fadeOutDuration.value = FADE_DURATION_DEFAULT;
    isNormalizationEnabled.value = false;
    normalizationTargetLufs.value = NORMALIZATION_TARGET_LUFS_DEFAULT;
    normalizationPreventClipping.value = true;

    pushToGraph();
    pushNormalizationToPlayer();
  }

  return {
    isEqEnabled,
    currentPreset,
    bandGains,

    isFadeEnabled,
    fadeInDuration,
    fadeOutDuration,

    isNormalizationEnabled,
    normalizationTargetLufs,
    normalizationPreventClipping,

    bands,

    presetCategories: EQ_PRESET_CATEGORIES,
    getPresetsByCategory,

    setBandGain,
    applyPreset,
    resetEqualizer,
    setEqEnabled,
    pushToGraph,

    setFadeEnabled,
    setFadeInDuration,
    setFadeOutDuration,

    pushNormalizationToPlayer,
    setNormalizationEnabled,
    setNormalizationTargetLufs,
    setNormalizationPreventClipping,
    reset,
  };
}, {
  persist: {
    key: "audiogram-audio-settings",
    pick: [
      "isEqEnabled",
      "currentPreset",
      "bandGains",
      "isFadeEnabled",
      "fadeInDuration",
      "fadeOutDuration",
      "isNormalizationEnabled",
      "normalizationTargetLufs",
      "normalizationPreventClipping",
    ],
  },
});
