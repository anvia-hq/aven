import { cn } from "cn";

import { useRuntime } from "@/modules/runtimes/hooks/use-runtime";

type Props = {
  runtimeId: string;
  className?: string;
};

export function RunnerStatus({ runtimeId, className }: Props) {
  const { runtime, loaded } = useRuntime(runtimeId);

  if (!loaded) return null;

  if (!runtime) return <span className={cn("text-destructive", className)}>Runner revoked</span>;

  return (
    <span
      title={runtime.online ? "Online" : "Offline"}
      className={cn("flex min-w-0 items-center gap-1.5", className)}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          runtime.online ? "bg-success" : "bg-muted-foreground/40",
        )}
      />
      <span className="truncate">{runtime.name}</span>
      <span className="sr-only">{runtime.online ? "online" : "offline"}</span>
    </span>
  );
}
