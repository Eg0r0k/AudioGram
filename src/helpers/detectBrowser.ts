import {
  IS_CHROMIUM,
  IS_FIREFOX,
  IS_SAFARI,
  IS_TAURI,
} from "@/helpers/environment/userAgent";

export interface BrowserInfo {
  name: string;
}
// TODO Delete after
export function detectBrowser(): BrowserInfo {
  if (IS_FIREFOX) {
    return { name: "Firefox" };
  }

  if (IS_CHROMIUM) {
    return { name: "Chrole" };
  }

  if (IS_SAFARI) {
    return { name: "Safari" };
  }

  if (IS_TAURI) {
    return { name: "Приложение" };
  }

  return { name: "Браузер" };
}
