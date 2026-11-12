import { Check, DangerCircle, StopSolid } from "@mynaui/icons-react";
import { cn } from "cn";
import { useState } from "react";

import { Button } from "@/components/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/collapsible";
import { shortTimeAgo, timeAgo } from "@/lib/format";

import { useProcessLogs } from "../hooks/use-process-logs";
import type { ProcessView } from "@aven/protocol/types";

type Props = {
  threadId: string;
  process: ProcessView;
  stopping: boolean;
  onStop: () => void;
  fixing: boolean;
  onFix?: () => void;
};

const CHIP = "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap";

function statusText({ status, exitCode, startedAt, endedAt }: ProcessView) {
  if (status === "running") return `Running for ${timeAgo(startedAt)}`;

  const when = endedAt ? ` · ${timeAgo(endedAt, true)}` : "";

  if (status === "stopped") return `Stopped${when}`;

  return exitCode ? `Exited with code ${exitCode}${when}` : `Finished${when}`;
}

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

function StateChip({ process }: { process: ProcessView }) {
  if (process.status === "running") {
    return (
      <span className={cn(CHIP, "bg-success/15 text-success")}>
        {shortTimeAgo(process.startedAt)}
      </span>
    );
  }

  if (process.status === "exited" && process.exitCode) {
    return (
      <span className={cn(CHIP, "bg-destructive/15 text-destructive")}>
        Exit {process.exitCode}
      </span>
    );
  }

  return (
    <span className={cn(CHIP, "bg-muted text-muted-foreground")}>
      {process.status === "stopped" ? "Stopped" : "Done"}
    </span>
  );
}

export function BackgroundProcess({ threadId, process, stopping, onStop, fixing, onFix }: Props) {
  const [open, setOpen] = useState(false);
  const running = process.status === "running";
  const failed = process.status === "exited" && Boolean(process.exitCode);
  const { logs, problem } = useProcessLogs(threadId, process.id, open, running);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex min-w-0 flex-col">
      <div className="-mx-1.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent/50">
        <CollapsibleTrigger
          className="grid min-w-0 flex-1 grid-cols-[1rem_1fr_auto] items-center gap-x-2 text-left outline-none focus-visible:underline"
          title={`${process.command}\n${statusText(process)}`}
        >
          <StatusMark process={process} />
          <span
            className={cn(
              "min-w-0 truncate font-mono text-xs",
              !running && "text-muted-foreground",
            )}
          >
            {process.command}
          </span>
          <StateChip process={process} />
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
        {onFix && failed && (
          <Button
            variant="outline"
            size="xs"
            disabled={fixing}
            aria-label={`Ask the agent to fix ${process.command}`}
            title="Ask the agent to fix this"
            onClick={onFix}
          >
            {fixing ? "Asking…" : "Fix"}
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
