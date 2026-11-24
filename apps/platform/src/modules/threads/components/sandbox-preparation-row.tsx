import { IconBox, IconLoader2 } from "@tabler/icons-react";
import { cn } from "cn";
import { useState } from "react";

import type { SandboxPhase } from "../types";

type Props = {
  phase: SandboxPhase;
};

export function SandboxPreparationRow({ phase }: Props) {
  const [enteredPreparing] = useState(phase === "preparing");
  const preparing = phase === "preparing";

  return (
    <div
      className={cn(
        "flex w-fit max-w-full items-center gap-2.5 py-0.5 text-sm text-muted-foreground",
        enteredPreparing && "timeline-in",
      )}
      data-role="sandbox-preparation"
      data-phase={phase}
    >
      {preparing ? (
        <IconLoader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <IconBox aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span
        key={phase}
        role={preparing ? "status" : undefined}
        className={cn(
          "min-w-0 truncate text-muted-foreground",
          preparing && "shimmer",
          !preparing && enteredPreparing && "narration-in",
        )}
      >
        {preparing ? "Preparing sandbox" : "Sandbox ready"}
      </span>
    </div>
  );
}
