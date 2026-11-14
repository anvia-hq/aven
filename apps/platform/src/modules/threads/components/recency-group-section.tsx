import { ChevronDown } from "@mynaui/icons-react";
import type { ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";
import { useLocalStorage } from "@/hooks/use-local-storage";

import type { RecencyGroup } from "../types";

type Props = { group: RecencyGroup; children: ReactNode };

export function RecencyGroupSection({ group, children }: Props) {
  const [open, setOpen] = useLocalStorage(`aven.sidebar-group.${group.id}`, true);
  return (
    <Collapsible
      render={<section data-group={group.id} aria-label={group.label} className="pb-4" />}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="flex h-6 items-center pl-2">
        <h3 className="flex min-w-0 flex-1">
          <CollapsibleTrigger className="group/heading flex min-w-0 flex-1 items-center gap-2 rounded-sm text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring">
            <span className="shrink-0">{group.label}</span>
            <span aria-hidden className="h-px flex-1 bg-foreground/10" />
            <ChevronDown className="size-3.5 shrink-0 -rotate-90 transition-transform duration-200 group-data-panel-open/heading:rotate-0 motion-reduce:transition-none" />
          </CollapsibleTrigger>
        </h3>
      </div>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
