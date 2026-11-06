import type { ProcessView } from "@aven/protocol/runtime-wire";
import { Check, DangerCircle, StopSolid } from "@mynaui/icons-react";
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

// Where a process is: a pulse while it runs, then a mark for how it ended; the words under the
// command say the same, so the mark is only drawn.
function StatusMark({ process }: { process: ProcessView }) {
  if (process.status === "running") {
    return (
      <span className="grid size-4 place-items-center" aria-hidden>
        <span className="size-2 animate-pulse rounded-full bg-success" />
      </span>
    );
  }
  if (process.status === "exited" && process.exitCode) {
    return <DangerCircle className="size-4 text-destructive" aria-hidden />;
  }
  if (process.status === "stopped") {
    return <StopSolid className="size-3 text-muted-foreground" aria-hidden />;
  }
  return <Check className="size-4 text-muted-foreground" aria-hidden />;
}

// One process as a row: how it is doing at the start, its command and when under it, a way to stop
// it at the end while it runs, and its output on demand, opened from the row.
export function BackgroundProcess({ threadId, process, stopping, onStop }: Props) {
  const [open, setOpen] = useState(false);
  const running = process.status === "running";
  const { logs, problem } = useProcessLogs(threadId, process.id, open, running);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex min-w-0 flex-col">
      <div className="-mx-1.5 flex min-w-0 items-start gap-1 rounded-md px-1.5 py-1 hover:bg-accent/50">
        <CollapsibleTrigger
          className="grid min-w-0 flex-1 grid-cols-[1rem_1fr] items-center gap-x-2 text-left outline-none focus-visible:underline"
          title={process.command}
        >
          <StatusMark process={process} />
          <span className="min-w-0 truncate font-mono text-xs">{process.command}</span>
          <span />
          <span className="text-[11px] text-muted-foreground" aria-live="polite">
            {statusText(process)}
          </span>
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
      <CollapsibleContent>
        {problem && <p className="pl-6 text-xs text-destructive">{problem}</p>}
        {logs && (
          <pre
            aria-label={`Output of ${process.command}`}
            className="mt-1 mb-1 max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-xs break-words whitespace-pre-wrap"
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
