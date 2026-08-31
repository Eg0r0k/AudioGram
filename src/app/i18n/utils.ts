import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/modules/settings/schema/general";

export const DEFAULT_LOCALE: SupportedLanguage = "en";

export const isSupportedLocale = (locale: string): locale is SupportedLanguage => {
  return SUPPORTED_LANGUAGES.includes(locale as SupportedLanguage);
};

export const setHtmlLangAttribute = (locale: string): void => {
  document.documentElement.lang = locale;
};

export const getBrowserLocale = (): SupportedLanguage | null => {
  const browserLang = navigator.language.split("-")[0];
  return browserLang && isSupportedLocale(browserLang) ? browserLang : null;
};

export const getSavedLocaleFromStorage = (): SupportedLanguage | null => {
  try {
    const stored = localStorage.getItem("settings");
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    const language = parsed?.settings?.general?.language;

    if (language && language !== "system" && isSupportedLocale(language)) {
      return language;
    }

    if (language === "system") {
      return getBrowserLocale();
    }

    return null;
  }
  catch {
    return null;
  }
};

export const getInitialLocale = (): SupportedLanguage => {
  const savedLocale = getSavedLocaleFromStorage();
  if (savedLocale) {
    setHtmlLangAttribute(savedLocale);
    return savedLocale;
  }

  const browserLocale = getBrowserLocale();
  if (browserLocale) {
    setHtmlLangAttribute(browserLocale);
    return browserLocale;
  }

  setHtmlLangAttribute(DEFAULT_LOCALE);
  return DEFAULT_LOCALE;
};
