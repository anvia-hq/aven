import { ToggleGroupItem } from "@aven/ui/toggle-group";
import { cn } from "cn";

import { DEFAULT_PALETTE } from "../catalog";
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
      data-theme={option.id === DEFAULT_PALETTE ? undefined : option.id}
      className={cn(
        "relative h-auto w-[172px] shrink-0 snap-start flex-col items-stretch justify-start gap-0 overflow-hidden rounded-[10px] border-border bg-background p-0 text-left text-foreground transition-none hover:bg-background",
        "aria-pressed:border-foreground/40 aria-pressed:bg-background aria-pressed:ring-1 aria-pressed:ring-foreground/40 aria-pressed:ring-inset",
      )}
    >
      <span className="flex h-[108px] flex-col justify-between gap-2.5 p-3">
        <span className="text-2xl font-semibold leading-none tracking-[-0.02em]">Aa</span>
        <span aria-hidden="true" className="flex flex-col gap-1">
          <span className="h-[3px] rounded-full bg-current opacity-25" />
          <span className="h-[3px] w-[54%] rounded-full bg-current opacity-45" />
        </span>
        <span aria-hidden="true" className="flex gap-1">
          <span className="h-3 flex-1 rounded-[3px] border border-input bg-card" />
          <span className="h-3 flex-1 rounded-[3px] bg-primary" />
          <span className="h-3 flex-1 rounded-[3px] bg-effort" />
        </span>
      </span>
      <span className="flex h-8 items-center border-t border-border px-3 text-xs font-medium">
        {option.label}
      </span>
    </ToggleGroupItem>
  );
}
