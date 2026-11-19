import { IconMaximize, IconMinimize } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";

import { cn } from "cn";

import { Button } from "@aven/ui/button";

const BORDER = 2;

export function MarkdownTable({
  node: _node,
  children,
  ...props
}: ComponentProps<"table"> & { node?: unknown }) {
  const [wide, setWide] = useState(false);
  const [natural, setNatural] = useState<number | undefined>(undefined);
  const table = useRef<HTMLTableElement>(null);
  const wideNow = useRef(wide);
  const Icon = wide ? IconMinimize : IconMaximize;

  wideNow.current = wide;

  useEffect(() => {
    const element = table.current;

    if (!element) return;

    const measure = () => {
      if (!wideNow.current) setNatural(element.offsetWidth + BORDER);
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(element);
    return () => watch.disconnect();
  }, []);

  return (
    <div
      data-slot="markdown-table"
      data-wide={wide}
      style={{
        width: wide
          ? "var(--table-wide, 100%)"
          : natural === undefined
            ? "fit-content"
            : `min(${natural}px, 100%)`,
        marginLeft: wide ? "calc((100% - var(--table-wide, 100%)) / 2)" : 0,
      }}
      className="group/table relative mt-9 mb-3 max-w-none transition-[width,margin-left] duration-300 ease-out motion-reduce:transition-none"
    >
      <div className="w-full overflow-x-auto rounded-xl border border-foreground/12 bg-foreground/[0.02]">
        <table ref={table} {...props} className={wide ? "w-full min-w-max" : "w-max"}>
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
