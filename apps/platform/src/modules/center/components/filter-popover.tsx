import { Filter } from "@mynaui/icons-react";
import type { ReactNode } from "react";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@aven/ui/popover";

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

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
