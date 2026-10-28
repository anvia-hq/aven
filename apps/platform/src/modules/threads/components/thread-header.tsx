import { Folder, Spinner, Stop } from "@mynaui/icons-react";

import { Button } from "@/components/button";

import type { Thread } from "../types";

type Props = {
  thread: Thread;
  running: boolean;
  onCancel: () => void;
};

export function ThreadHeader({ thread, running, onCancel }: Props) {
  return (
    <header className="flex items-center gap-3 border-b px-6 py-3">
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{thread.title}</h1>
      <span
        className="hidden min-w-0 max-w-sm items-center gap-1 text-xs text-muted-foreground sm:flex"
        title={thread.projectPath}
      >
        <Folder className="size-3.5 shrink-0" />
        <span className="truncate font-mono">{thread.projectPath}</span>
      </span>
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
