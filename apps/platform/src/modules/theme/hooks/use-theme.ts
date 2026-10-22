import { useAtom } from "jotai";
import { useEffect } from "react";

import { themeAtom } from "../atoms/theme-atom";

// Keeps the `dark` class on <html> in sync with the selected theme.
export function useTheme() {
  const [theme, setTheme] = useAtom(themeAtom);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme !== "light");
  }, [theme]);

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  return { theme, setTheme, toggleTheme };
}
