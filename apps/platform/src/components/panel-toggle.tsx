import type { ComponentType } from "react";

import { cn } from "cn";

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
      className={cn("size-8 transition-none md:size-7", open && "bg-accent")}
      aria-label={label}
      aria-pressed={open}
      onClick={onToggle}
    >
      <Icon />
    </Button>
  );
}
