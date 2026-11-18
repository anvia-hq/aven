import { MaximizeIcon, MinimizeIcon } from "@solar-icons/react/linear";
import { useState } from "react";
import type { ComponentProps } from "react";

import { cn } from "cn";

import { Button } from "@aven/ui/button";

export function MarkdownTable({
  node: _node,
  children,
  ...props
}: ComponentProps<"table"> & { node?: unknown }) {
  const [wide, setWide] = useState(false);
  const Icon = wide ? MinimizeIcon : MaximizeIcon;

  return (
    <div
      data-slot="markdown-table"
      data-wide={wide}
      className={cn(
        "group/table relative mt-9 mb-3",
        wide ? "left-1/2 w-(--table-wide,100%) min-w-full -translate-x-1/2" : "w-fit max-w-full",
      )}
    >
      <div className="w-full overflow-x-auto rounded-xl border border-foreground/12 bg-foreground/[0.02]">
        <table {...props} className="w-full">
          {children}
        </table>
      </div>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label={wide ? "Fit the table to its content" : "Make the table full width"}
        aria-pressed={wide}
        className="absolute -top-7 right-0 text-muted-foreground opacity-0 transition-opacity group-focus-within/table:opacity-100 group-hover/table:opacity-100 pointer-coarse:opacity-100"
        onClick={() => setWide((current) => !current)}
      >
        <Icon />
      </Button>
    </div>
  );
}
