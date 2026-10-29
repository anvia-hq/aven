import { Monitor, Spinner, Stop } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { RuntimeBadge } from "@/modules/runtimes/components/runtime-badge";

import type { Thread } from "../types";

type Props = {
  thread: Thread;
  running: boolean;
  onCancel: () => void;
  desktopOpen: boolean;
  onToggleDesktop: () => void;
};

export function ThreadHeader({ thread, running, onCancel, desktopOpen, onToggleDesktop }: Props) {
  return (
    <header className="flex items-center gap-3 border-b px-6 py-3">
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{thread.title}</h1>
      <RuntimeBadge runtimeId={thread.runtimeId} />
      <Button
        variant={desktopOpen ? "secondary" : "ghost"}
        size="sm"
        aria-pressed={desktopOpen}
        onClick={onToggleDesktop}
      >
        <Monitor /> Desktop
      </Button>
      {running && (
        <>
          <Spinner className="size-4 animate-spin text-muted-foreground" aria-label="Running" />
          <Button variant="outline" size="sm" onClick={onCancel}>
            <Stop /> Stop
          </Button>
        </>
      )}
    </header>
  );
}
