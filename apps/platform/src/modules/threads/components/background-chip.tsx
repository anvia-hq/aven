import { Tooltip, TooltipContent, TooltipTrigger } from "@aven/ui/tooltip";

import { useThreadProcesses } from "@/modules/overview/hooks/use-thread-processes";

export function BackgroundChip({ threadId, running }: { threadId: string; running: boolean }) {
  const { processes } = useThreadProcesses(threadId, running);
  const active = processes.filter((process) => process.status === "running");

  if (active.length === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            data-role="background-chip"
            tabIndex={0}
            className="wash flex w-fit max-w-full items-center gap-2 rounded-full border px-3 py-1 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-success" aria-hidden />
        <span role="status" className="min-w-0 truncate">
          {active.length === 1 ? "1 background task" : `${active.length} background tasks`}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm flex-col items-start gap-1">
        {active.map((process) => (
          <span key={process.id} className="font-mono text-[11px] break-all">
            {process.command}
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
