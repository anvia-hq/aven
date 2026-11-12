import { useAtom } from "jotai";
import { useEffect, useState } from "react";

import { fontAtom } from "../atoms/font-atom";
import { paletteAtom } from "../atoms/palette-atom";
import { themeAtom } from "../atoms/theme-atom";
import { DEFAULT_PALETTE, SANS_FONTS } from "../types";
import type { Theme } from "../types";

const FONT_LINK_ID = "aven-font";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function resolveTheme(theme: Theme, systemDark: boolean): "light" | "dark" {
  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}

export function useTheme() {
  const [theme, setTheme] = useAtom(themeAtom);
  const [palette, setPalette] = useAtom(paletteAtom);
  const [font, setFont] = useAtom(fontAtom);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches);
  const resolvedTheme = resolveTheme(theme, systemDark);

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const follow = () => setSystemDark(query.matches);
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

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

  return { theme, resolvedTheme, setTheme, palette, setPalette, font, setFont };
}
