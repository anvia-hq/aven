import { Filter } from "@mynaui/icons-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";

// The filters of a list behind one button, with how many are on: the list keeps its room for what
// it lists, and what is on shows as chips under its header (`FilterChips`).
export function FilterPopover({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" aria-label={label} />}>
        <Filter />
        Filters
        {count > 0 && <Badge variant="secondary">{count}</Badge>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-3">
        {children}
      </PopoverContent>
    </Popover>
  );
}

// A labelled field of the popover.
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
