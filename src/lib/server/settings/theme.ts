import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { defineThemes } from "@ajstrongdev/start-themes";
import { selectedColorSchemeCookie } from "@/lib/color-schemes";
import { instance } from "@/lib/instance-config";

const themeLabels = {
  "Default (Light)": "light",
  "Default (Dark)": "dark",
  Dracula: "dracula",
  "Rosé Pine": "rose-pine",
  Catppuccin: "catppuccin-dark",
  Nord: "nord",
  "Solarized (Light)": "solarized-light",
  Solarized: "solarized",
} as const;
const builtInThemes = ["light", "dark", "dracula", "rose-pine", "catppuccin-dark", "t3", "nord", "solarized-light", "solarized"] as const;
export type ThemeId = (typeof builtInThemes)[number];

export const themeConfig = defineThemes({
  themes: [
    {
      id: "light",
      label: "Default (Light)",
      isDark: false,
      swatch: "oklch(0.55 0.09 145)",
    },
    {
      id: "dark",
      label: "Default (Dark)",
      isDark: true,
      swatch: "oklch(0.58 0.07 150)",
    },
    {
      id: "dracula",
      label: "Dracula",
      isDark: true,
      swatch: "oklch(0.7 0.16 310)",
    },
    {
      id: "rose-pine",
      label: "Rosé Pine",
      isDark: true,
      swatch: "oklch(0.68 0.14 350)",
    },
    {
      id: "catppuccin-dark",
      label: "Catppuccin",
      isDark: true,
      swatch: "oklch(0.7 0.15 310)",
    },
    {
      id: "t3",
      label: "t3",
      isDark: true,
      swatch: "oklch(0.55 0.15 355)",
    },
    {
      id: "nord",
      label: "Nord",
      isDark: true,
      swatch: "oklch(0.68 0.06 240)",
    },
    {
      id: "solarized-light",
      label: "Solarized (Light)",
      isDark: false,
      swatch: "oklch(0.62 0.1 230)",
    },
    {
      id: "solarized",
      label: "Solarized",
      isDark: true,
      swatch: "oklch(0.62 0.1 230)",
    },
  ],
  defaultTheme:
    themeLabels[instance.theme.default as keyof typeof themeLabels] ??
    (instance.theme.default as ThemeId),
  cookieKey: "_preferred-theme",
});

export const { themes } = themeConfig;
export const getThemeServerFn = createServerFn().handler(() => {
  const saved = getCookie(themeConfig.cookieKey);
  return { theme: themeConfig.resolveTheme(saved), hasPreference: Boolean(saved) };
});

export const setThemeServerFn = createServerFn({ method: "POST" })
  .inputValidator(themeConfig.validateTheme)
  .handler(({ data }) => {
    setCookie(selectedColorSchemeCookie, "", { maxAge: 0, path: "/" });
    return setCookie(themeConfig.cookieKey, data, {
      maxAge: themeConfig.cookieMaxAge,
    });
  });

export const resetThemeServerFn = createServerFn({ method: "POST" }).handler(() => {
  setCookie(themeConfig.cookieKey, "", { maxAge: 0, path: "/" });
  setCookie(selectedColorSchemeCookie, "", { maxAge: 0, path: "/" });
});

export const getThemeClasses = themeConfig.getClasses;
