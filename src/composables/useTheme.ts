import { watch, computed } from "vue";
import { usePreferredDark, useStorage } from "@vueuse/core";

type ThemeMode = "light" | "dark" | "system";

const mode = useStorage<ThemeMode>("theme-mode", "system");
const prefersDark = usePreferredDark();

const resolvedTheme = computed<"light" | "dark">(() => {
  if (mode.value === "system") {
    return prefersDark.value ? "dark" : "light";
  }
  return mode.value;
});

const applyTheme = (theme: "light" | "dark") => {
  document.documentElement.classList.toggle("dark", theme === "dark");

  const themeColor = theme === "dark" ? "#0a0a0a" : "#ffffff";
  let metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute("content", themeColor);
  }
};

export const useTheme = () => {
  const changeTheme = (newMode: ThemeMode) => {
    mode.value = newMode;
  };

  const toggleTheme = async (event?: MouseEvent) => {
    const newTheme = resolvedTheme.value === "dark" ? "light" : "dark";

    if (
      !event ||
      !document.startViewTransition ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      mode.value = newTheme;
      return;
    }

    const x = event.clientX;
    const y = event.clientY;

    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const isLightToDark = resolvedTheme.value === "light";

    document.documentElement.classList.add("theme-transitioning");
    document.documentElement.classList.toggle(
      "theme-transition-reverse",
      !isLightToDark
    );

    const transition = document.startViewTransition(() => {
      mode.value = newTheme;
    });

    try {
      await transition.ready;

      const clipPathStart = `circle(0px at ${x}px ${y}px)`;
      const clipPathEnd = `circle(${endRadius}px at ${x}px ${y}px)`;

      const animation = document.documentElement.animate(
        {
          clipPath: isLightToDark
            ? [clipPathStart, clipPathEnd]
            : [clipPathEnd, clipPathStart],
        },
        {
          duration: 500,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          pseudoElement: isLightToDark
            ? "::view-transition-new(root)"
            : "::view-transition-old(root)",
        }
      );

      await animation.finished;
    } finally {
      document.documentElement.classList.remove(
        "theme-transitioning",
        "theme-transition-reverse"
      );
    }
  };

  return {
    mode,
    resolvedTheme,
    isDark: computed(() => resolvedTheme.value === "dark"),
    changeTheme,
    toggleTheme,
  };
};

applyTheme(resolvedTheme.value);
watch(resolvedTheme, applyTheme);
