import { X } from "@mynaui/icons-react";
import type { ReactNode } from "react";

import { Button } from "@/components/button";

type Props = { titles: [string, string]; onUnpair: () => void; children: ReactNode };

export function SplitPairGroup({ titles, onUnpair, children }: Props) {
  return (
    <div data-slot="split-pair" className="group/pair relative flex flex-col">
      <span
        aria-hidden
        className="pointer-events-none absolute top-4 bottom-4 -left-0.5 w-1.5 rounded-l-md border-y border-l border-muted-foreground/50"
      />
      {children}
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-1/2 -left-2 size-4 -translate-y-1/2 rounded-full border bg-sidebar opacity-0 group-focus-within/pair:opacity-100 group-hover/pair:opacity-100"
        aria-label={`Unpair ${titles[0]} and ${titles[1]}`}
        title="Unpair"
        onClick={onUnpair}
      >
        <X className="size-2.5" />
      </Button>
    </div>
  );
}
