import { LayoutDashboard, Monitor, Spinner, Stop } from "@mynaui/icons-react";

import { Button } from "@/components/button";

import type { Thread } from "../types";

type Props = {
  thread: Thread;
  running: boolean;
  onCancel: () => void;
  overviewOpen: boolean;
  onToggleOverview: () => void;
  desktopOpen: boolean;
  onToggleDesktop: () => void;
};

export function ThreadHeader({
  thread,
  running,
  onCancel,
  overviewOpen,
  onToggleOverview,
  desktopOpen,
  onToggleDesktop,
}: Props) {
  return (
    <header className="flex items-center gap-2 h-10 shrink-0 border-b px-4">
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{thread.title}</h1>
      {running && (
        <>
          <Spinner className="size-4 animate-spin text-muted-foreground" aria-label="Running" />
          <Button variant="outline" size="sm" onClick={onCancel}>
            <Stop /> Stop
          </Button>
        </>
      )}
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
    </header>
  );
}
