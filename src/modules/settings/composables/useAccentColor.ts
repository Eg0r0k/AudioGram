import { ref, watch, onUnmounted } from "vue";
import { getAccentColorOption } from "../accent-colors";
import { AccentColor } from "../schema/appearance";

const DEFAULT_ACCENT_COLOR: AccentColor = "blue";
const DEFAULT_CUSTOM_COLOR = "#8774e1";

const accentColor = ref<AccentColor>(
  (localStorage.getItem("accent-color") as AccentColor) || DEFAULT_ACCENT_COLOR,
);
const customAccentColor = ref<string>(
  localStorage.getItem("accent-color-custom") || DEFAULT_CUSTOM_COLOR,
);

let initialized = false;

function applyAccentColor(color: AccentColor, isDark: boolean) {
  const root = document.documentElement;

  if (color === "custom") {
    root.style.setProperty("--primary", customAccentColor.value);
    root.style.setProperty("--sidebar-primary", customAccentColor.value);
    return;
  }

  const option = getAccentColorOption(color);
  const vars = isDark ? option.dark : option.light;

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains("dark");
}

export function useAccentColor() {
  if (!initialized) {
    applyAccentColor(accentColor.value, isDarkMode());
    initialized = true;

    const observer = new MutationObserver(() => {
      applyAccentColor(accentColor.value, isDarkMode());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    onUnmounted(() => observer.disconnect());
  }

  watch(accentColor, (newColor) => {
    applyAccentColor(newColor, isDarkMode());
  });

  function setAccentColor(color: AccentColor) {
    accentColor.value = color;
    localStorage.setItem("accent-color", color);
  }

  function setCustomAccentColor(color: string) {
    customAccentColor.value = color;
    localStorage.setItem("accent-color-custom", color);
    if (accentColor.value !== "custom") {
      setAccentColor("custom");
      return;
    }
    // Same "custom" value — the watch on accentColor won't fire; re-apply.
    applyAccentColor("custom", isDarkMode());
  }

  function resetAccentColor() {
    setAccentColor(DEFAULT_ACCENT_COLOR);
  }

  return {
    accentColor,
    customAccentColor,
    setAccentColor,
    setCustomAccentColor,
    resetAccentColor,
  };
}
