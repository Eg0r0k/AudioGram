import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  AudioSettings,
  DEFAULT_SETTINGS,
  GeneralSettings,
  NdSourceSettings,
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

/** Drops the credential from a settings section without mutating the original. */
const withoutPassword = <T extends { password: string }>(section: T): Omit<T, "password"> => {
  const copy: Record<string, unknown> = { ...section };
  delete copy.password;
  return copy as Omit<T, "password">;
};

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<Settings>(structuredClone(DEFAULT_SETTINGS));
  const isLoaded = ref(false);
  const isSaving = ref(false);
  const error = ref<Error | null>(null);

  const general = computed(() => settings.value.general);
  const playback = computed(() => settings.value.playback);
  const audio = computed(() => settings.value.audio);
  const proxy = computed(() => settings.value.proxy);
  const sources = computed(() => settings.value.sources);

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

  const updateNdSource = (partial: Partial<NdSourceSettings>) => {
    settings.value.sources = {
      ...settings.value.sources,
      nd: { ...settings.value.sources.nd, ...partial },
    };
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

  /**
   * Settings as shareable JSON. Passwords are stripped, never blanked in
   * place: an export is a file the user hands to a bug report or copies
   * between machines, and a credential in it is a leak the user can't see.
   * The schema defaults them back to "" on import, so the file still
   * round-trips — the source just needs its password re-entered.
   */
  const exportToJSON = (): string => {
    const current = settings.value;

    return JSON.stringify({
      ...current,
      proxy: withoutPassword(current.proxy),
      sources: { ...current.sources, nd: withoutPassword(current.sources.nd) },
    }, null, 2);
  };

  return {
    settings,
    isLoaded,
    isSaving,
    error,

    general,
    playback,
    audio,
    proxy,
    sources,

    updateGeneral,
    updatePlayback,
    updateAudio,
    updateProxy,
    updateNdSource,
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
