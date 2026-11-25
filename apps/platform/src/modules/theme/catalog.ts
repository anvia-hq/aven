import type {
  Palette,
  PaletteOption,
  SansFont,
  SansFontOption,
  TextSize,
  TextSizeOption,
  TextSizeScope,
  Theme,
  ThemeOption,
} from "./types";

export const THEME_STORAGE_KEY = "theme";
export const DEFAULT_THEME: Theme = "dark";

export const THEMES: ThemeOption[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

export const PALETTE_STORAGE_KEY = "palette";
export const DEFAULT_PALETTE: Palette = "aven";

export const PALETTES: PaletteOption[] = [
  {
    id: "aven",
    label: "Aven",
    light: "oklch(0.22 0.003 280)",
    dark: "oklch(0.93 0.003 280)",
  },
  {
    id: "mint",
    label: "Mint",
    light: "oklch(0.22 0.018 165)",
    dark: "oklch(0.93 0.012 208)",
  },
  { id: "github", label: "GitHub", light: "#0969da", dark: "#58a6ff" },
  { id: "one-dark", label: "One Dark", light: "#3b6cd9", dark: "#61afef" },
  { id: "nord", label: "Nord", light: "#516d91", dark: "#88c0d0" },
  { id: "rose-pine", label: "Rosé Pine", light: "#286983", dark: "#9ccfd8" },
  { id: "monokai", label: "Monokai", light: "#c4265e", dark: "#a6e22e" },
  { id: "material", label: "Material", light: "#5876a6", dark: "#82aaff" },
  { id: "night-owl", label: "Night Owl", light: "#4672ce", dark: "#82aaff" },
  { id: "oceanic", label: "Oceanic", light: "#3978b8", dark: "#6699cc" },
  { id: "horizon", label: "Horizon", light: "#c74868", dark: "#e95378" },
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
  {
    id: "dm-sans",
    label: "DM Sans",
    family: '"DM Sans", system-ui, sans-serif',
    googleQuery: "family=DM+Sans:wght@400;500;600;700",
  },
  {
    id: "manrope",
    label: "Manrope",
    family: '"Manrope", system-ui, sans-serif',
    googleQuery: "family=Manrope:wght@400;500;600;700",
  },
  {
    id: "plus-jakarta-sans",
    label: "Plus Jakarta Sans",
    family: '"Plus Jakarta Sans", system-ui, sans-serif',
    googleQuery: "family=Plus+Jakarta+Sans:wght@400;500;600;700",
  },
  {
    id: "nunito-sans",
    label: "Nunito Sans",
    family: '"Nunito Sans", system-ui, sans-serif',
    googleQuery: "family=Nunito+Sans:wght@400;500;600;700",
  },
  {
    id: "lato",
    label: "Lato",
    family: '"Lato", system-ui, sans-serif',
    googleQuery: "family=Lato:wght@400;700",
  },
  {
    id: "open-sans",
    label: "Open Sans",
    family: '"Open Sans", system-ui, sans-serif',
    googleQuery: "family=Open+Sans:wght@400;500;600;700",
  },
  {
    id: "roboto",
    label: "Roboto",
    family: '"Roboto", system-ui, sans-serif',
    googleQuery: "family=Roboto:wght@400;500;600;700",
  },
  {
    id: "poppins",
    label: "Poppins",
    family: '"Poppins", system-ui, sans-serif',
    googleQuery: "family=Poppins:wght@400;500;600;700",
  },
  {
    id: "work-sans",
    label: "Work Sans",
    family: '"Work Sans", system-ui, sans-serif',
    googleQuery: "family=Work+Sans:wght@400;500;600;700",
  },
  {
    id: "outfit",
    label: "Outfit",
    family: '"Outfit", system-ui, sans-serif',
    googleQuery: "family=Outfit:wght@400;500;600;700",
  },
];

export const TEXT_SIZES: TextSizeOption[] = [
  { id: "small", label: "Small", scale: 0.9 },
  { id: "default", label: "Default", scale: 1 },
  { id: "large", label: "Large", scale: 1.125 },
  { id: "x-large", label: "Extra large", scale: 1.25 },
];

export const DEFAULT_TEXT_SIZE: TextSize = "default";

export const TEXT_SIZE_STORAGE_KEYS: Record<TextSizeScope, string> = {
  interface: "interface-text-size",
  thread: "thread-text-size",
  bot: "bot-text-size",
};
