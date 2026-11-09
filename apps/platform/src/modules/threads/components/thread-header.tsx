import {
  Check,
  Folder,
  GitDiff,
  LayoutPanelLeft,
  List,
  Monitor,
  Terminal,
  X,
} from "@mynaui/icons-react";
import type { ComponentType } from "react";

import { cn } from "cn";

import { Button } from "@/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { PanelToggle } from "@/components/panel-toggle";

import type { Thread, ThreadPanels } from "../types";
import { ThreadShare } from "./thread-share";

type Props = {
  thread: Thread;
  panels: ThreadPanels;
  owned: boolean;
  onClose?: () => void;
};

type Toggle = {
  label: string;
  icon: ComponentType;
  panel: ThreadPanels["overview"];
  show: boolean;
};

export function ThreadHeader({ thread, panels, owned, onClose }: Props) {
  const toggles: Toggle[] = [
    { label: "Overview", icon: List, panel: panels.overview, show: true },
    { label: "Desktop", icon: Monitor, panel: panels.desktop, show: owned },
    { label: "Changes", icon: GitDiff, panel: panels.diff, show: true },
    { label: "Files", icon: Folder, panel: panels.files, show: true },
    { label: "Terminal", icon: Terminal, panel: panels.terminal, show: owned },
  ];
  const shown = toggles.filter((toggle) => toggle.show);

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3 md:h-10 md:px-4">
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{thread.title}</h1>
      {owned && <ThreadShare thread={thread} />}
      {onClose && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Close ${thread.title}`}
          title="Close"
          onClick={onClose}
        >
          <X />
        </Button>
      )}
      <div className={cn("hidden items-center gap-2 sm:flex", onClose && "sm:hidden")}>
        {shown.map(({ label, icon, panel }) => (
          <PanelToggle
            key={label}
            label={label}
            icon={icon}
            open={panel.open}
            onToggle={panel.toggle}
          />
        ))}
      </div>
      {!onClose && <PanelsMenu toggles={shown} className="sm:hidden" />}
    </header>
  );
}

function PanelsMenu({ toggles, className }: { toggles: Toggle[]; className?: string }) {
  const open = toggles.filter((toggle) => toggle.panel.open).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn("size-9 aria-expanded:bg-accent md:size-7", className)}
            aria-label={open > 0 ? `Panels, ${open} open` : "Panels"}
          />
        }
      >
        <LayoutPanelLeft />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {toggles.map(({ label, icon: Icon, panel }) => (
          <DropdownMenuItem key={label} onClick={panel.toggle}>
            <Icon />
            <span className="flex-1">{label}</span>
            {panel.open && <Check className="size-4 text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
