import {
  IconAppWindow,
  IconCheck,
  IconFolder,
  IconGitCompare,
  IconLayoutSidebarRight,
  IconList,
  IconTerminal2,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
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
import { PanelToggle } from "@aven/ui/panel-toggle";
import { SidebarTrigger } from "@aven/ui/sidebar";
import { useMediaQuery } from "@aven/ui/use-media-query";

import { useRenameThread } from "../hooks/use-rename-thread";
import type { Thread, ThreadPanels } from "../types";
import { ThreadOptionsMenu } from "./thread-options-menu";
import { ThreadShare, ThreadShareButton } from "./thread-share";
import { ThreadTitleField } from "./thread-title-field";

const WIDE_SCREEN = "(min-width: 48rem)";

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
  const wide = useMediaQuery(WIDE_SCREEN);
  const toggles: Toggle[] = [
    { label: "Overview", icon: IconList, panel: panels.overview, show: true },
    { label: "Changes", icon: IconGitCompare, panel: panels.diff, show: true },
    { label: "Files", icon: IconFolder, panel: panels.files, show: true },
    { label: "Terminal", icon: IconTerminal2, panel: panels.terminal, show: owned },
    { label: "Browser", icon: IconAppWindow, panel: panels.preview, show: owned },
  ];
  const shown = toggles.filter((toggle) => toggle.show);

  const finishRename = (title?: string) => {
    setRenaming(false);

    if (title !== undefined) void rename(thread, title);
  };

  if (!wide) {
    return (
      <header className="relative z-10 flex h-(--mobile-app-bar) shrink-0 items-center gap-1 border-b border-border/60 bg-background/95 px-2 backdrop-blur-sm">
        <SidebarTrigger className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground [&_svg:not([class*='size-'])]:size-[18px]" />
        <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1">
          {renaming ? (
            <ThreadTitleField title={thread.title} onDone={finishRename} />
          ) : (
            <>
              <h1
                className="min-w-0 truncate text-[15px] font-medium tracking-[-0.01em]"
                style={thread.markColor ? { color: thread.markColor } : undefined}
              >
                {thread.title}
              </h1>
              {thread.visibility === "workspace" && (
                <IconWorld
                  aria-label="Shared to workspace"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {!onClose && <PanelsMenu toggles={shown} mobile />}
          <ThreadOptionsMenu
            thread={thread}
            canRun={owned || driven}
            canColor={owned}
            canTitle={owned}
            align="end"
            onShare={owned ? () => setSharing(true) : undefined}
            onRename={owned ? () => setRenaming(true) : undefined}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground [&_svg:not([class*='size-'])]:size-[18px]"
                aria-label="Thread options"
                title="More"
              />
            }
          />
        </div>
        {owned && <ThreadShare thread={thread} open={sharing} onOpenChange={setSharing} />}
      </header>
    );
  }

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-linear-to-b from-background from-55% to-transparent px-4 pt-1.5 pb-5">
      <div className="pointer-events-auto flex h-8 min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {renaming ? (
            <ThreadTitleField title={thread.title} onDone={finishRename} />
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
            canTitle={owned}
            onShare={owned ? () => setSharing(true) : undefined}
            onRename={owned ? () => setRenaming(true) : undefined}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 shrink-0 rounded-full aria-expanded:bg-accent"
                aria-label="Thread options"
                title="More"
              />
            }
          />
          {owned && <ThreadShareButton thread={thread} onClick={() => setSharing(true)} />}
        </div>
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
            <IconX />
          </Button>
        )}
        <div
          role="group"
          aria-label="Panels"
          className={cn(
            "flex items-center gap-0.5 rounded-full bg-muted/50 p-0.5",
            onClose && "hidden",
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
      </div>
    </header>
  );
}

function PanelsMenu({
  toggles,
  className,
  mobile = false,
}: {
  toggles: Toggle[];
  className?: string;
  mobile?: boolean;
}) {
  const open = toggles.filter((toggle) => toggle.panel.open).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              "relative shrink-0 rounded-full text-muted-foreground hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
              mobile ? "size-9 [&_svg:not([class*='size-'])]:size-[18px]" : "size-7",
              open > 0 && "text-foreground",
              className,
            )}
            aria-label={open > 0 ? `Panels, ${open} open` : "Panels"}
          />
        }
      >
        <IconLayoutSidebarRight />
        {open > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-foreground"
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {toggles.map(({ label, icon: Icon, panel }) => (
          <DropdownMenuItem key={label} onClick={panel.toggle}>
            <Icon />
            <span className="flex-1">{label}</span>
            {panel.open && <IconCheck className="size-4 text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
