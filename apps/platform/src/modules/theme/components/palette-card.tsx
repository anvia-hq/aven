import { IconCheck } from "@tabler/icons-react";
import { ToggleGroupItem } from "@aven/ui/toggle-group";
import { cn } from "cn";

import type { PaletteOption } from "../types";

type Props = {
  option: PaletteOption;
  mode: "light" | "dark";
};

export function PaletteCard({ option, mode }: Props) {
  return (
    <ToggleGroupItem
      value={option.id}
      aria-label={option.label}
      data-palette={option.id}
      data-mode={mode}
      data-theme={option.id}
      className={cn(
        "group/card relative h-auto w-[176px] shrink-0 snap-start flex-col items-stretch justify-start gap-0 overflow-hidden rounded-xl border border-border bg-background p-0 text-left text-foreground transition-[border-color,box-shadow] duration-150 hover:border-foreground/25 hover:bg-background",
        "aria-pressed:border-primary aria-pressed:bg-background aria-pressed:ring-2 aria-pressed:ring-primary/20",
      )}
    >
      <span aria-hidden="true" className="flex h-[96px] w-full overflow-hidden">
        <span className="flex w-[34%] shrink-0 flex-col gap-1.5 border-r border-border bg-frame p-2">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-primary" />
            <span className="h-1.5 w-7 rounded-full bg-foreground/20" />
          </span>
          <span className="mt-0.5 flex flex-col gap-1">
            <span className="flex h-3.5 items-center rounded-[4px] bg-accent px-1">
              <span className="h-1 w-8 rounded-full bg-foreground/70" />
            </span>
            <span className="flex h-2.5 items-center px-1">
              <span className="h-1 w-7 rounded-full bg-muted-foreground/35" />
            </span>
            <span className="flex h-2.5 items-center px-1">
              <span className="h-1 w-5 rounded-full bg-muted-foreground/25" />
            </span>
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-between bg-background p-2">
          <span className="flex flex-col gap-1.5">
            <span className="ml-auto flex h-3.5 w-12 items-center rounded-md border border-foreground/10 bg-accent px-1.5">
              <span className="h-1 w-full rounded-full bg-foreground/65" />
            </span>
            <span className="flex flex-col gap-1 pt-0.5">
              <span className="h-1 w-14 rounded-full bg-foreground/70" />
              <span className="flex items-center gap-1">
                <span className="h-1 w-9 rounded-full bg-muted-foreground/40" />
                <span className="h-1 w-3 rounded-full bg-effort" />
              </span>
            </span>
          </span>
          <span className="flex h-4 items-center justify-between rounded-md border border-border bg-card px-1.5">
            <span className="h-1 w-8 rounded-full bg-muted-foreground/30" />
            <span className="size-2 rounded-full bg-primary" />
          </span>
        </span>
      </span>
      <span className="flex h-8 items-center justify-between gap-2 border-t border-border bg-card px-2.5">
        <span className="min-w-0 truncate text-xs font-medium text-foreground">{option.label}</span>
        <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
          <span className="flex items-center -space-x-0.5 group-aria-pressed/card:hidden">
            <span className="size-2.5 rounded-full bg-primary ring-1 ring-card" />
            <span className="size-2.5 rounded-full bg-effort ring-1 ring-card" />
          </span>
          <span className="hidden size-4 items-center justify-center rounded-full bg-primary text-primary-foreground group-aria-pressed/card:flex">
            <IconCheck className="size-2.5" strokeWidth={2.5} />
          </span>
        </span>
      </span>
    </ToggleGroupItem>
  );
}
