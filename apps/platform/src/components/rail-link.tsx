import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "cn";

import { Tooltip, TooltipContent, TooltipTrigger } from "@aven/ui/tooltip";

type Props = {
  to: NonNullable<LinkProps["to"]>;
  label: string;
  tooltip?: string;
  active: boolean;
  children: ReactNode;
};

export function RailLink({ to, label, tooltip = label, active, children }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            to={to}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground outline-none transition-[color,background-color,transform] duration-200 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-frame active:scale-95 motion-reduce:transition-none",
              active && "bg-accent text-foreground",
            )}
          />
        }
      >
        {children}
        {active && (
          <span
            aria-hidden="true"
            className="absolute top-1/2 -left-1.5 h-3.5 w-[3px] -translate-y-1/2 rounded-r-sm bg-primary"
          />
        )}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
