import { Moon, Sun } from "@mynaui/icons-react";
import type { ComponentProps } from "react";

import { Button } from "@/components/button";

import { useTheme } from "../hooks/use-theme";

export function ThemeSelector(props: ComponentProps<typeof Button>) {
  const { toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      {...props}
      onClick={toggleTheme}
    >
      <Sun className="size-5 dark:hidden" />
      <Moon className="hidden size-5 dark:block" />
    </Button>
  );
}
