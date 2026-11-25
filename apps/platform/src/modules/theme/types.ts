export type Theme = "light" | "dark" | "system";

export type ThemeOption = {
  id: Theme;
  label: string;
};

export type Palette =
  | "aven"
  | "mint"
  | "github"
  | "one-dark"
  | "nord"
  | "rose-pine"
  | "monokai"
  | "material"
  | "night-owl"
  | "oceanic"
  | "horizon"
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

export type SansFont =
  | "system"
  | "inter"
  | "ibm-plex-sans"
  | "source-sans-3"
  | "geist"
  | "dm-sans"
  | "manrope"
  | "plus-jakarta-sans"
  | "nunito-sans"
  | "lato"
  | "open-sans"
  | "roboto"
  | "poppins"
  | "work-sans"
  | "outfit";

export type SansFontOption = {
  id: SansFont;
  label: string;
  family: string;
  googleQuery?: string;
};

export type TextSize = "small" | "default" | "large" | "x-large";

export type TextSizeScope = "interface" | "thread" | "bot";

export type TextSizeOption = { id: TextSize; label: string; scale: number };
