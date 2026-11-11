import { Moon, Sun } from "@mynaui/icons-react";

import { Button } from "@/components/button";

import { useTheme } from "../hooks/use-theme";

export function ThemeSelector({ className }: { className?: string }) {
  const { toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      className={className}
      onClick={toggleTheme}
    >
      <Sun className="size-5 dark:hidden" />
      <Moon className="hidden size-5 dark:block" />
    </Button>
  );
}
