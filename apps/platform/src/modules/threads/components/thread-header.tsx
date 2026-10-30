import { Folder, GitDiff, LayoutDashboard, Monitor } from "@mynaui/icons-react";
import type { ComponentType } from "react";

import { Button } from "@/components/button";

import type { ThreadPanels } from "../hooks/use-thread-panels";
import type { Thread } from "../types";
import { ShipButton } from "./ship-button";

type Props = {
  thread: Thread;
  panels: ThreadPanels;
};

export function ThreadHeader({ thread, panels }: Props) {
  const toggles = [
    { label: "Overview", icon: LayoutDashboard, panel: panels.overview },
    { label: "Desktop", icon: Monitor, panel: panels.desktop },
    { label: "Changes", icon: GitDiff, panel: panels.diff },
    { label: "Files", icon: Folder, panel: panels.files },
  ];
  return (
    <header className="flex items-center gap-2 h-10 shrink-0 border-b px-4">
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{thread.title}</h1>
      <ShipButton thread={thread} />
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
      variant={open ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      aria-pressed={open}
      onClick={onToggle}
    >
      <Icon />
    </Button>
  );
}
