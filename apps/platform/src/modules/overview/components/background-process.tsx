import type { ProcessView } from "@aven/protocol/runtime-wire";
import { ChevronDown, ChevronRight } from "@mynaui/icons-react";
import { cn } from "cn";
import { useState } from "react";

import { Button } from "@/components/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/collapsible";
import { timeAgo } from "@/lib/format";

import { useProcessLogs } from "../hooks/use-process-logs";

type Props = {
  threadId: string;
  process: ProcessView;
  stopping: boolean;
  onStop: () => void;
};

function statusText({ status, exitCode, startedAt, endedAt }: ProcessView) {
  if (status === "running") return `Running for ${timeAgo(startedAt)}`;
  const when = endedAt ? ` · ${timeAgo(endedAt, true)}` : "";
  if (status === "stopped") return `Stopped${when}`;
  return exitCode ? `Exited with code ${exitCode}${when}` : `Finished${when}`;
}

// One process: what it runs, how it is doing, a way to stop it, and its output on demand.
export function BackgroundProcess({ threadId, process, stopping, onStop }: Props) {
  const [open, setOpen] = useState(false);
  const running = process.status === "running";
  const failed = process.status === "exited" && Boolean(process.exitCode);
  const { logs, problem } = useProcessLogs(threadId, process.id, open, running);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full",
            running && "animate-pulse bg-primary",
            !running && !failed && "bg-muted-foreground/50",
            failed && "bg-destructive",
          )}
        />
        <CollapsibleTrigger
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1 text-left outline-none focus-visible:underline",
            !running && "text-muted-foreground",
          )}
          title={process.command}
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" />
          )}
          <span className="min-w-0 truncate font-mono text-xs">{process.command}</span>
        </CollapsibleTrigger>
        {running && (
          <Button
            variant="outline"
            size="xs"
            disabled={stopping}
            aria-label={`Stop ${process.command}`}
            onClick={onStop}
          >
            {stopping ? "Stopping…" : "Stop"}
          </Button>
        )}
      </div>
      <p className="pl-4 text-xs text-muted-foreground" aria-live="polite">
        {statusText(process)}
      </p>
      <CollapsibleContent>
        {problem && <p className="pl-4 text-xs text-destructive">{problem}</p>}
        {logs && (
          <pre
            aria-label={`Output of ${process.command}`}
            className="ml-4 max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-xs break-words whitespace-pre-wrap"
          >
            {logs.stdout || logs.stderr
              ? `${logs.stdout}${logs.stderr}`.trimEnd()
              : "Nothing printed yet."}
          </pre>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
