import { IconCheck, IconLoader2, IconX } from "@tabler/icons-react";
import { cn } from "cn";

import type { SubagentPart } from "../types";

function StatusNode({ status }: { status: SubagentPart["status"] }) {
  if (status === "error")
    return (
      <IconX
        role="img"
        aria-label="Failed"
        style={{ strokeWidth: 2.4 }}
        className="size-3.5 text-destructive"
      />
    );

  if (status === "running")
    return (
      <IconLoader2
        aria-hidden
        style={{ strokeWidth: 2.4 }}
        className="size-3.5 animate-spin text-meter"
      />
    );

  return <IconCheck aria-hidden style={{ strokeWidth: 2.4 }} className="size-3.5 text-success" />;
}

export function SubagentCard({ subagent }: { subagent: SubagentPart }) {
  const { description, status, output } = subagent;

  return (
    <div className="relative min-w-0 pb-3 pl-8.5 text-sm before:absolute before:top-6 before:bottom-0.5 before:left-2.25 before:w-px before:bg-border last:pb-0 last:before:hidden">
      <span className="absolute top-0 left-0 grid size-5 place-items-center rounded-full bg-background">
        <StatusNode status={status} />
      </span>
      <span
        className={cn(
          "flex min-h-5 w-full min-w-0 items-center truncate leading-5 font-medium",
          status === "running" && "shimmer",
        )}
      >
        {description}
      </span>
      {status === "error" && output && <p className="mt-0.5 text-xs text-destructive">{output}</p>}
    </div>
  );
}
