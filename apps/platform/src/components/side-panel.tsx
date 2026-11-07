import { X } from "@mynaui/icons-react";
import type { ComponentType, ReactNode } from "react";

import { Button } from "@/components/button";

type Props = {
  title: string;
  icon: ComponentType<{ className?: string }>;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

export function SidePanel({ title, icon: Icon, actions, onClose, children }: Props) {
  return (
    <section
      className="flex size-full min-w-0 flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background"
      aria-label={title}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">{title}</h2>
        {actions}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Close ${title.toLowerCase()}`}
          onClick={onClose}
        >
          <X />
        </Button>
      </header>
      {children}
    </section>
  );
}
