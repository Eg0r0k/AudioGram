import { computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useNavigatorLanguage } from "@vueuse/core";
import { useSettingsStore } from "../store";
import { GeneralSettings, SupportedLanguage, SUPPORTED_LANGUAGES } from "../schema";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { TAURI_ONLY_KEYS } from "../schema/general";
import { DEFAULT_LOCALE, isSupportedLocale, setHtmlLangAttribute } from "@/app/i18n/utils";
import { autostartService } from "../services/autostart";

export interface LanguageOption {
  code: SupportedLanguage;
  name: string;
  native: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "system", name: "System", native: "System" },
  { code: "en", name: "English", native: "English" },
  { code: "ru", name: "Russian", native: "Русский" },
];

const LANGUAGE_NATIVE_MAP: Record<string, string> = {
  en: "English",
  ru: "Русский",
};

export const useGeneralSettings = () => {
  const store = useSettingsStore();
  const { locale } = useI18n();
  const { language: browserLanguage } = useNavigatorLanguage();

  const settings = computed(() => store.general);
  const language = computed(() => store.general.language);
  const checkUpdatesOnLaunch = computed(() => store.general.checkUpdatesOnLaunch);
  const analyzeTracks = computed(() => store.general.analyzeTracks);
  const closeToTray = computed(() => store.general.closeToTray);
  const launchAtStartup = computed(() => store.general.launchAtStartup);
  const launchMinimized = computed(() => store.general.launchMinimized);

  const systemLanguage = computed<SupportedLanguage>(() => {
    const browserLang = browserLanguage.value?.split("-")[0];
    if (browserLang && isSupportedLocale(browserLang)) {
      return browserLang;
    }
    return DEFAULT_LOCALE;
  });

  const activeLanguage = computed<SupportedLanguage>(() => {
    if (language.value === "system") {
      return systemLanguage.value;
    }
    return language.value;
  });

  const activeLanguageNative = computed(() => {
    return LANGUAGE_NATIVE_MAP[activeLanguage.value] || activeLanguage.value;
  });

  const applyLanguage = (lang: SupportedLanguage) => {
    const effectiveLang = lang === "system" ? systemLanguage.value : lang;
    locale.value = effectiveLang;
    setHtmlLangAttribute(effectiveLang);
  };

  const setLanguage = (lang: SupportedLanguage) => {
    store.updateGeneral({ language: lang });
    applyLanguage(lang);
  };

  const setCheckUpdatesOnLaunch = (value: boolean) => {
    store.updateGeneral({ checkUpdatesOnLaunch: value });
  };

  const setAnalyzeTracks = (value: boolean) => {
    store.updateGeneral({ analyzeTracks: value });
  };

  const setCloseToTray = (value: boolean) => {
    if (!IS_TAURI) return;
    store.updateGeneral({ closeToTray: value });
  };

  const setLaunchAtStartup = async (value: boolean) => {
    if (!IS_TAURI) return;

    const result = await (value ? autostartService.enable() : autostartService.disable());

    result.match(
      () => store.updateGeneral({ launchAtStartup: value }),
      err => console.error("[autostart]", err.message, err.cause),
    );
  };

  const setLaunchMinimized = (value: boolean) => {
    if (!IS_TAURI) return;
    store.updateGeneral({ launchMinimized: value });
  };

  const update = (partial: Partial<GeneralSettings>) => {
    if (!IS_TAURI) {
      const filtered = { ...partial };
      for (const key of TAURI_ONLY_KEYS) {
        delete filtered[key];
      }
      store.updateGeneral(filtered);
    }
    else {
      store.updateGeneral(partial);
    }
  };

  const syncAutostart = async () => {
    if (!IS_TAURI) return;

    const result = await autostartService.isEnabled();
    result.match(
      enabled => store.updateGeneral({ launchAtStartup: enabled }),
      err => console.warn("[autostart] sync failed:", err.message),
    );
  };

  const init = async () => {
    applyLanguage(language.value);
    await syncAutostart();

    watch(browserLanguage, () => {
      if (language.value === "system") {
        applyLanguage("system");
      }
    });
  };

  return {
    // State
    settings,
    language,
    activeLanguage,
    activeLanguageNative,
    systemLanguage,
    checkUpdatesOnLaunch,
    analyzeTracks,
    closeToTray,
    launchAtStartup,
    launchMinimized,

    // Constants
    isTauri: IS_TAURI,
    languages: LANGUAGE_OPTIONS,
    supportedLanguages: SUPPORTED_LANGUAGES,

    // Actions
    setLanguage,
    setCheckUpdatesOnLaunch,
    setAnalyzeTracks,
    setCloseToTray,
    setLaunchAtStartup,
    setLaunchMinimized,
    update,
    init,
  };
};
