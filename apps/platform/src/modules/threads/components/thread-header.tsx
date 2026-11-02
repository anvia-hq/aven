import { Folder, GitDiff, List, Monitor, Terminal } from "@mynaui/icons-react";
import { PanelToggle } from "@/components/panel-toggle";

import type { ThreadPanels } from "../hooks/use-thread-panels";
import type { Thread } from "../types";
import { ThreadShare } from "./thread-share";

type Props = {
  thread: Thread;
  panels: ThreadPanels;
  /** The person made the thread. Anyone else reads it: no Desktop or Terminal, and no sharing. */
  owned: boolean;
};

export function ThreadHeader({ thread, panels, owned }: Props) {
  const toggles = [
    { label: "Overview", icon: List, panel: panels.overview, show: true },
    { label: "Desktop", icon: Monitor, panel: panels.desktop, show: owned },
    { label: "Changes", icon: GitDiff, panel: panels.diff, show: true },
    { label: "Files", icon: Folder, panel: panels.files, show: true },
    { label: "Terminal", icon: Terminal, panel: panels.terminal, show: owned },
  ];
  return (
    <header className="flex items-center gap-2 h-10 shrink-0 border-b px-4">
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{thread.title}</h1>
      {owned && <ThreadShare thread={thread} />}
      {toggles
        .filter((toggle) => toggle.show)
        .map(({ label, icon, panel }) => (
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
