import { X } from "@mynaui/icons-react";
import type { ReactNode } from "react";

import { Button } from "@/components/button";

type Props = { titles: [string, string]; onUnpair: () => void; children: ReactNode };

export function SplitPairGroup({ titles, onUnpair, children }: Props) {
  return (
    <div
      data-slot="split-pair"
      className="group/pair relative flex gap-0.5 rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-0.5"
    >
      {children}
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute -top-2.5 -right-1.5 size-5 rounded-full border bg-sidebar opacity-0 group-focus-within/pair:opacity-100 group-hover/pair:opacity-100"
        aria-label={`Unpair ${titles[0]} and ${titles[1]}`}
        title="Unpair"
        onClick={onUnpair}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}
