import { Folder, GitDiff, List, Monitor } from "@mynaui/icons-react";
import type { ComponentType } from "react";

import { Button } from "@/components/button";

import type { ThreadPanels } from "../hooks/use-thread-panels";
import type { Thread } from "../types";

type Props = {
  thread: Thread;
  panels: ThreadPanels;
};

export function ThreadHeader({ thread, panels }: Props) {
  const toggles = [
    { label: "Overview", icon: List, panel: panels.overview },
    { label: "Desktop", icon: Monitor, panel: panels.desktop },
    { label: "Changes", icon: GitDiff, panel: panels.diff },
    { label: "Files", icon: Folder, panel: panels.files },
  ];
  return (
    <header className="flex items-center gap-2 h-10 shrink-0 border-b px-4">
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{thread.title}</h1>
      {toggles.map(({ label, icon, panel }) => (
        <PanelToggle
          key={label}
          label={label}
          icon={icon}
          open={panel.open}
          onToggle={panel.toggle}
        />
      ))}
    </header>
  );
}

type ToggleProps = {
  label: string;
  icon: ComponentType;
  open: boolean;
  onToggle: () => void;
};

function PanelToggle({ label, icon: Icon, open, onToggle }: ToggleProps) {
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
