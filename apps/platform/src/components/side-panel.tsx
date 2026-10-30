import { X } from "@mynaui/icons-react";
import type { ComponentType, ReactNode } from "react";

import { Button } from "@/components/button";

type Props = {
  /** Names the panel: its heading, its landmark and its close button ("Close <title>"). */
  title: string;
  icon: ComponentType<{ className?: string }>;
  /** What the header holds between the title and the close button. */
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

// A panel beside a thread's conversation: a header with its name, its own actions and a close
// button, over the panel's body.
export function SidePanel({ title, icon: Icon, actions, onClose, children }: Props) {
  return (
    <section className="flex size-full min-w-0 flex-col" aria-label={title}>
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
