import { Spinner, Stop } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { RuntimeBadge } from "@/modules/runtimes/components/runtime-badge";

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
      <RuntimeBadge runtimeId={thread.runtimeId} />
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
