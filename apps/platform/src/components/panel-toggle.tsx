import type { ComponentType } from "react";

import { Button } from "@/components/button";

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
      className={open ? "bg-accent" : undefined}
      aria-label={label}
      aria-pressed={open}
      onClick={onToggle}
    >
      <Icon />
    </Button>
  );
}
