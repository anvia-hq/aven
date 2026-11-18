import type { ComponentType } from "react";

import { cn } from "cn";

import { Button } from "@aven/ui/button";

type Props = {
  label: string;
  icon: ComponentType;
  open: boolean;
  onToggle: () => void;
};

export function PanelToggle({ label, icon: Icon, open, onToggle }: Props) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn(
        "size-8 rounded-full text-muted-foreground transition-colors md:size-7",
        open && "bg-background text-foreground shadow-sm hover:bg-background",
      )}
      aria-label={label}
      title={label}
      aria-pressed={open}
      onClick={onToggle}
    >
      <Icon />
    </Button>
  );
}
