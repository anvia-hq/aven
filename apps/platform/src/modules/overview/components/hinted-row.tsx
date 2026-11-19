import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@aven/ui/tooltip";

export function HintedRow({
  label,
  value,
  hint,
  marker,
}: {
  label: string;
  value: string;
  hint: string;
  marker: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<div tabIndex={0} className="flex cursor-default justify-between" />}>
        <dt className="flex items-center gap-2 text-muted-foreground">
          {marker}
          {label}
        </dt>
        <dd className="tabular-nums">{value}</dd>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-64">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
