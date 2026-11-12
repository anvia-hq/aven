export type Theme = "light" | "dark" | "system";

export type ThemeOption = {
  id: Theme;
  label: string;
};

export type Palette = "mint" | "catppuccin" | "tokyo-night" | "github" | "one-dark" | "solarized";

export type PaletteOption = {
  id: Palette;
  label: string;
  light: string;
  dark: string;
};

export const THEME_STORAGE_KEY = "theme";
export const DEFAULT_THEME: Theme = "dark";

export const THEMES: ThemeOption[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

export const PALETTE_STORAGE_KEY = "palette";
export const DEFAULT_PALETTE: Palette = "mint";

export const PALETTES: PaletteOption[] = [
  { id: "mint", label: "Mint", light: "oklch(0.22 0.01 160)", dark: "oklch(0.93 0.006 160)" },
  { id: "catppuccin", label: "Catppuccin", light: "#1e66f5", dark: "#89b4fa" },
  { id: "tokyo-night", label: "Tokyo Night", light: "#2e7de9", dark: "#7aa2f7" },
  { id: "github", label: "GitHub", light: "#0969da", dark: "#58a6ff" },
  { id: "one-dark", label: "One Dark", light: "#4078f2", dark: "#61afef" },
  { id: "solarized", label: "Solarized", light: "#268bd2", dark: "#268bd2" },
];

export type SansFont = "system" | "inter" | "ibm-plex-sans" | "source-sans-3" | "geist";

export type SansFontOption = {
  id: SansFont;
  label: string;
  family: string;
  googleQuery?: string;
};

export const FONT_STORAGE_KEY = "font";
export const DEFAULT_FONT: SansFont = "system";

export const SANS_FONTS: SansFontOption[] = [
  {
    id: "system",
    label: "System default",
    family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  {
    id: "inter",
    label: "Inter",
    family: '"Inter", system-ui, sans-serif',
    googleQuery: "family=Inter:wght@400;500;600;700",
  },
  {
    id: "ibm-plex-sans",
    label: "IBM Plex Sans",
    family: '"IBM Plex Sans", system-ui, sans-serif',
    googleQuery: "family=IBM+Plex+Sans:wght@400;500;600;700",
  },
  {
    id: "source-sans-3",
    label: "Source Sans 3",
    family: '"Source Sans 3", system-ui, sans-serif',
    googleQuery: "family=Source+Sans+3:wght@400;500;600;700",
  },
  {
    id: "geist",
    label: "Geist",
    family: '"Geist", system-ui, sans-serif',
    googleQuery: "family=Geist:wght@400;500;600;700",
  },
];
