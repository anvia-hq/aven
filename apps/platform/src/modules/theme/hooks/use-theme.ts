import { useAtom } from "jotai";
import { useEffect } from "react";

import { fontAtom } from "../atoms/font-atom";
import { paletteAtom } from "../atoms/palette-atom";
import { themeAtom } from "../atoms/theme-atom";
import { DEFAULT_PALETTE, SANS_FONTS } from "../types";

const FONT_LINK_ID = "aven-font";

export function useTheme() {
  const [theme, setTheme] = useAtom(themeAtom);
  const [palette, setPalette] = useAtom(paletteAtom);
  const [font, setFont] = useAtom(fontAtom);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme !== "light");
  }, [theme]);

  useEffect(() => {
    if (palette === DEFAULT_PALETTE) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", palette);
  }, [palette]);

  useEffect(() => {
    const option = SANS_FONTS.find((item) => item.id === font) ?? SANS_FONTS[0];
    document.documentElement.style.setProperty("--app-font", option.family);
    const existing = document.getElementById(FONT_LINK_ID);
    if (!option.googleQuery) {
      existing?.remove();
      return;
    }
    const link = existing ?? document.createElement("link");
    if (!(link instanceof HTMLLinkElement)) return;
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${option.googleQuery}&display=swap`;
    if (!existing) document.head.appendChild(link);
  }, [font]);

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  return { theme, setTheme, toggleTheme, palette, setPalette, font, setFont };
}
