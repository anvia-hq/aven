import {
  CheckIcon,
  FolderIcon,
  GitDiffIcon,
  WindowFrameIcon,
  SidebarMinimalisticIcon,
  ListIcon,
  Code2Icon,
  CloseIcon,
} from "@solar-icons/react/linear";
import type { ComponentType } from "react";
import { useState } from "react";

import { cn } from "cn";

import { Button } from "@aven/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aven/ui/dropdown-menu";
import { PanelToggle } from "@/components/panel-toggle";

import { useRenameThread } from "../hooks/use-rename-thread";
import type { Thread, ThreadPanels } from "../types";
import { ThreadOptionsMenu } from "./thread-options-menu";
import { ThreadShare, ThreadShareButton } from "./thread-share";
import { ThreadTitleField } from "./thread-title-field";

type Props = {
  thread: Thread;
  panels: ThreadPanels;
  owned: boolean;
  driven: boolean;
  onClose?: () => void;
};

type Toggle = {
  label: string;
  icon: ComponentType;
  panel: ThreadPanels["overview"];
  show: boolean;
};

export function ThreadHeader({ thread, panels, owned, driven, onClose }: Props) {
  const [sharing, setSharing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const rename = useRenameThread();
  const toggles: Toggle[] = [
    { label: "Overview", icon: ListIcon, panel: panels.overview, show: true },
    { label: "Changes", icon: GitDiffIcon, panel: panels.diff, show: true },
    { label: "Files", icon: FolderIcon, panel: panels.files, show: true },
    { label: "Terminal", icon: Code2Icon, panel: panels.terminal, show: owned },
    { label: "Browser", icon: WindowFrameIcon, panel: panels.preview, show: owned },
  ];
  const shown = toggles.filter((toggle) => toggle.show);

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 px-3 md:h-10 md:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {renaming ? (
          <ThreadTitleField
            title={thread.title}
            onDone={(title) => {
              setRenaming(false);

              if (title !== undefined) void rename(thread, title);
            }}
          />
        ) : (
          <h1
            className="min-w-0 truncate text-sm font-medium"
            style={thread.markColor ? { color: thread.markColor } : undefined}
          >
            {thread.title}
          </h1>
        )}
        <ThreadOptionsMenu
          thread={thread}
          canRun={owned || driven}
          canColor={owned}
          onShare={owned ? () => setSharing(true) : undefined}
          onRename={owned ? () => setRenaming(true) : undefined}
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9 shrink-0 rounded-full aria-expanded:bg-accent md:size-7"
              aria-label="Thread options"
              title="More"
            />
          }
        />
      </div>
      {owned && <ThreadShareButton thread={thread} onClick={() => setSharing(true)} />}
      {owned && <ThreadShare thread={thread} open={sharing} onOpenChange={setSharing} />}
      {onClose && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label={`Close ${thread.title}`}
          title="Close"
          onClick={onClose}
        >
          <CloseIcon />
        </Button>
      )}
      <div
        role="group"
        aria-label="Panels"
        className={cn(
          "hidden items-center gap-0.5 rounded-full bg-muted/50 p-0.5 sm:flex",
          onClose && "sm:hidden",
        )}
      >
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
            className={cn("size-9 rounded-full aria-expanded:bg-accent md:size-7", className)}
            aria-label={open > 0 ? `Panels, ${open} open` : "Panels"}
          />
        }
      >
        <SidebarMinimalisticIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {toggles.map(({ label, icon: Icon, panel }) => (
          <DropdownMenuItem key={label} onClick={panel.toggle}>
            <Icon />
            <span className="flex-1">{label}</span>
            {panel.open && <CheckIcon className="size-4 text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
