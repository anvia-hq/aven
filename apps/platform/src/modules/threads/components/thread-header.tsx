import { GitDiff, LayoutDashboard, Monitor } from "@mynaui/icons-react";

import { Button } from "@/components/button";

import type { Thread } from "../types";

type Props = {
  thread: Thread;
  overviewOpen: boolean;
  onToggleOverview: () => void;
  desktopOpen: boolean;
  onToggleDesktop: () => void;
  diffOpen: boolean;
  onToggleDiff: () => void;
};

export function ThreadHeader({
  thread,
  overviewOpen,
  onToggleOverview,
  desktopOpen,
  onToggleDesktop,
  diffOpen,
  onToggleDiff,
}: Props) {
  return (
    <header className="flex items-center gap-2 h-10 shrink-0 border-b px-4">
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{thread.title}</h1>
      <Button
        variant={overviewOpen ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label="Overview"
        aria-pressed={overviewOpen}
        onClick={onToggleOverview}
      >
        <LayoutDashboard />
      </Button>
      <Button
        variant={desktopOpen ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label="Desktop"
        aria-pressed={desktopOpen}
        onClick={onToggleDesktop}
      >
        <Monitor />
      </Button>
      <Button
        variant={diffOpen ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label="Changes"
        aria-pressed={diffOpen}
        onClick={onToggleDiff}
      >
        <GitDiff />
      </Button>
    </header>
  );
}
