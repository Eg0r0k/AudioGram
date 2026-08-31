import type { AccentColor } from "./schema/appearance";

export interface AccentColorOption {
  value: AccentColor;
  label: string;
  preview: string;
  light: {
    "--primary": string;
    "--sidebar-primary": string;
  };
  dark: {
    "--primary": string;
    "--sidebar-primary": string;
  };
}

export const ACCENT_COLOR_OPTIONS: AccentColorOption[] = [
  {
    value: "blue",
    label: "Blue",
    preview: "#8774e1",
    light: {
      "--primary": "oklch(0.6444 0.1623 251.76)",
      "--sidebar-primary": "oklch(0.6444 0.1623 251.76)",
    },
    dark: {
      "--primary": "oklch(0.6267 0.1594 288.96)",
      "--sidebar-primary": "oklch(0.6267 0.1594 288.96)",
    },
  },

  {
    value: "pink",
    label: "Pink",
    preview: "#e84393",
    light: {
      "--primary": "oklch(0.7163 0.1909 2.48)",
      "--sidebar-primary": "oklch(0.5927 0.2135 350.11)",
    },
    dark: {
      "--primary": "oklch(0.6805 0.1983 348.87)",
      "--sidebar-primary": "oklch(0.6805 0.1983 348.87)",
    },
  },
  {
    value: "red",
    label: "Red",
    preview: "#e74c3c",
    light: {
      "--primary": "oklch(0.5771 0.2107 25.47)",
      "--sidebar-primary": "oklch(0.5771 0.2107 25.47)",
    },
    dark: {
      "--primary": "oklch(0.6673 0.2019 23.80)",
      "--sidebar-primary": "oklch(0.6673 0.2019 23.80)",
    },
  },
  {
    value: "orange",
    label: "Orange",
    preview: "#f39c12",
    light: {
      "--primary": "oklch(0.6669 0.1792 52.73)",
      "--sidebar-primary": "oklch(0.6669 0.1792 52.73)",
    },
    dark: {
      "--primary": "oklch(0.7245 0.1657 55.12)",
      "--sidebar-primary": "oklch(0.7245 0.1657 55.12)",
    },
  },
  {
    value: "yellow",
    label: "Yellow",
    preview: "#f1c40f",
    light: {
      "--primary": "oklch(0.7245 0.1723 78.95)",
      "--sidebar-primary": "oklch(0.7245 0.1723 78.95)",
    },
    dark: {
      "--primary": "oklch(0.7912 0.1542 82.34)",
      "--sidebar-primary": "oklch(0.7912 0.1542 82.34)",
    },
  },
  {
    value: "green",
    label: "Green",
    preview: "#27ae60",
    light: {
      "--primary": "oklch(0.7697 0.2124 148.67)",
      "--sidebar-primary": "oklch(0.5864 0.1582 152.53)",
    },
    dark: {
      "--primary": "oklch(0.6794 0.185 148.67)",
      "--sidebar-primary": "oklch(0.6794 0.185 148.67)",
    },
  },
  {
    value: "teal",
    label: "Teal",
    preview: "#00b894",
    light: {
      "--primary": "oklch(0.5863 0.1185 180.72)",
      "--sidebar-primary": "oklch(0.5863 0.1185 180.72)",
    },
    dark: {
      "--primary": "oklch(0.6734 0.1148 183.45)",
      "--sidebar-primary": "oklch(0.6734 0.1148 183.45)",
    },
  },
];

export function getAccentColorOption(value: AccentColor): AccentColorOption {
  return ACCENT_COLOR_OPTIONS.find(o => o.value === value) ?? ACCENT_COLOR_OPTIONS[0];
}
