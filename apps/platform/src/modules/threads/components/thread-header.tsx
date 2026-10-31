import { Folder, GitDiff, List, Monitor, Terminal } from "@mynaui/icons-react";
import { PanelToggle } from "@/components/panel-toggle";

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
    { label: "Terminal", icon: Terminal, panel: panels.terminal },
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
