import { Moon, Sun } from "@mynaui/icons-react";

import { Button } from "@/components/button";

import { useTheme } from "../hooks/use-theme";

export function ThemeSelector() {
  const { toggleTheme } = useTheme();

  return (
    <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={toggleTheme}>
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}
