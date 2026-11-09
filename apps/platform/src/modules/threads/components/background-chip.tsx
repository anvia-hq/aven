import { useThreadProcesses } from "@/modules/overview/hooks/use-thread-processes";

export function BackgroundChip({ threadId, running }: { threadId: string; running: boolean }) {
  const { processes } = useThreadProcesses(threadId, running);
  const active = processes.filter((process) => process.status === "running");
  if (active.length === 0) return null;
  const [first] = active;

  return (
    <div
      data-role="background-chip"
      className="flex w-fit max-w-full items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground"
    >
      <span className="size-2 shrink-0 animate-pulse rounded-full bg-success" aria-hidden />
      <span role="status" className="min-w-0 truncate">
        {active.length === 1
          ? `Running in the background: ${first!.command}`
          : `${active.length} background tasks running`}
      </span>
    </div>
  );
}
