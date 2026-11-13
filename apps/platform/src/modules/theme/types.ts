export type Theme = "light" | "dark" | "system";

export type ThemeOption = {
  id: Theme;
  label: string;
};

export type Palette =
  | "mint"
  | "catppuccin"
  | "tokyo-night"
  | "github"
  | "one-dark"
  | "solarized"
  | "nord"
  | "dracula"
  | "gruvbox"
  | "rose-pine"
  | "monokai"
  | "ayu"
  | "material"
  | "everforest"
  | "night-owl"
  | "palenight"
  | "kanagawa"
  | "oceanic"
  | "horizon"
  | "zenburn"
  | "synthwave"
  | "codex"
  | "claude"
  | "devin"
  | "t3";

export type PaletteFont = {
  family: string;
  googleQuery?: string;
};

export type PaletteOption = {
  id: Palette;
  label: string;
  light: string;
  dark: string;
  heading?: PaletteFont;
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
  {
    id: "mint",
    label: "Mint",
    light: "oklch(0.22 0.01 160)",
    dark: "oklch(0.93 0.006 160)",
  },
  { id: "catppuccin", label: "Catppuccin", light: "#1e66f5", dark: "#89b4fa" },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    light: "#2e7de9",
    dark: "#7aa2f7",
  },
  { id: "github", label: "GitHub", light: "#0969da", dark: "#58a6ff" },
  { id: "one-dark", label: "One Dark", light: "#4078f2", dark: "#61afef" },
  { id: "solarized", label: "Solarized", light: "#268bd2", dark: "#268bd2" },
  { id: "nord", label: "Nord", light: "#5e81ac", dark: "#88c0d0" },
  { id: "dracula", label: "Dracula", light: "#7c3aed", dark: "#bd93f9" },
  { id: "gruvbox", label: "Gruvbox", light: "#076678", dark: "#83a598" },
  { id: "rose-pine", label: "Rosé Pine", light: "#286983", dark: "#9ccfd8" },
  { id: "monokai", label: "Monokai", light: "#c4265e", dark: "#a6e22e" },
  { id: "ayu", label: "Ayu", light: "#399ee6", dark: "#e6b450" },
  { id: "material", label: "Material", light: "#6182b8", dark: "#82aaff" },
  { id: "everforest", label: "Everforest", light: "#3a94c5", dark: "#a7c080" },
  { id: "night-owl", label: "Night Owl", light: "#4876d6", dark: "#82aaff" },
  { id: "palenight", label: "Palenight", light: "#7c4dff", dark: "#82aaff" },
  { id: "kanagawa", label: "Kanagawa", light: "#4d699b", dark: "#7e9cd8" },
  { id: "oceanic", label: "Oceanic", light: "#3b7dbf", dark: "#6699cc" },
  { id: "horizon", label: "Horizon", light: "#e95378", dark: "#e95378" },
  { id: "zenburn", label: "Zenburn", light: "#5b7ea0", dark: "#8cd0d3" },
  { id: "synthwave", label: "Synthwave", light: "#c026d3", dark: "#ff7edb" },
  { id: "codex", label: "Codex", light: "#0d0d0d", dark: "#ffffff" },
  {
    id: "claude",
    label: "Claude",
    light: "#b5552f",
    dark: "#d97757",
    heading: {
      family: '"Source Serif 4", "Iowan Old Style", Georgia, serif',
      googleQuery: "family=Source+Serif+4:opsz,wght@8..60,400;8..60,600",
    },
  },
  {
    id: "devin",
    label: "Devin",
    light: "#005fcc",
    dark: "#4d8dff",
    heading: {
      family: '"Inter", system-ui, sans-serif',
      googleQuery: "family=Inter:wght@400;500;600",
    },
  },
  {
    id: "t3",
    label: "T3",
    light: "#7c3aed",
    dark: "#a78bfa",
    heading: {
      family: '"Geist", system-ui, sans-serif',
      googleQuery: "family=Geist:wght@400;500;600",
    },
  },
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

export type FontChoice = SansFont | "inherit";

export type FontScope = "thread" | "bot";

export const INHERIT_FONT = "inherit";

export const SCOPED_FONT_STORAGE_KEYS: Record<FontScope, string> = {
  thread: "thread-font",
  bot: "bot-font",
};
