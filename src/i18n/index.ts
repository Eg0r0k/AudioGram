import { createI18n } from "vue-i18n";
import { messages } from "./messages";

const DEFAULT_LOCALE = "ru";

export const i18n = createI18n({
  legacy: false,
  messages,
  locale: DEFAULT_LOCALE,
  fallbackFormat: DEFAULT_LOCALE,
});
