import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  AudioSettings,
  DEFAULT_SETTINGS,
  GeneralSettings,
  PlaybackSettings,
  ProxySettings,
  Settings,
  SettingsSchema,
} from "../schema";
import { safeParse } from "valibot";
import { err, ok, Result } from "neverthrow";

export interface SettingsError {
  code: "PARSE_ERROR" | "VALIDATION_ERROR" | "IMPORT_ERROR";
  message: string;
  cause?: unknown;
}

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<Settings>(structuredClone(DEFAULT_SETTINGS));
  const isLoaded = ref(false);
  const isSaving = ref(false);
  const error = ref<Error | null>(null);

  const general = computed(() => settings.value.general);
  const playback = computed(() => settings.value.playback);
  const audio = computed(() => settings.value.audio);
  const proxy = computed(() => settings.value.proxy);

  const updateGeneral = (partial: Partial<GeneralSettings>) => {
    settings.value.general = { ...settings.value.general, ...partial };
  };

  const updatePlayback = (partial: Partial<PlaybackSettings>) => {
    settings.value.playback = { ...settings.value.playback, ...partial };
  };

  const updateAudio = (partial: Partial<AudioSettings>) => {
    settings.value.audio = { ...settings.value.audio, ...partial };
  };

  const updateProxy = (partial: Partial<ProxySettings>) => {
    settings.value.proxy = { ...settings.value.proxy, ...partial };
  };

  const reset = () => {
    settings.value = structuredClone(DEFAULT_SETTINGS);
  };

  const resetSection = <K extends keyof Omit<Settings, "version">>(section: K) => {
    settings.value[section] = structuredClone(DEFAULT_SETTINGS[section]);
  };

  const importFromJSON = (json: string): Result<Settings, SettingsError> => {
    let parsed: unknown;

    try {
      parsed = JSON.parse(json);
    }
    catch (e) {
      return err({
        code: "PARSE_ERROR",
        message: "Invalid JSON format",
        cause: e,
      });
    }

    const result = safeParse(SettingsSchema, parsed);

    if (!result.success) {
      return err({
        code: "VALIDATION_ERROR",
        message: "Settings validation failed",
        cause: result.issues,
      });
    }

    settings.value = result.output;
    return ok(result.output);
  };

  function exportToJSON(): string {
    return JSON.stringify(settings.value, null, 2);
  }

  return {
    settings,
    isLoaded,
    isSaving,
    error,

    general,
    playback,
    audio,
    proxy,

    updateGeneral,
    updatePlayback,
    updateAudio,
    updateProxy,
    reset,
    resetSection,
    exportToJSON,
    importFromJSON,
  };
}, {
  persist: {
    pick: ["settings"],

    serializer: {
      serialize: JSON.stringify,
      deserialize: (value: string) => {
        try {
          const parsed = JSON.parse(value);
          const result = safeParse(SettingsSchema, parsed.settings);

          if (result.success) {
            return { settings: result.output };
          }

          console.warn("[Settings] Invalid stored data, merging with defaults");
          return { settings: { ...DEFAULT_SETTINGS, ...parsed.settings } };
        }
        catch {
          return { settings: DEFAULT_SETTINGS };
        }
      },
    },
  },
});
