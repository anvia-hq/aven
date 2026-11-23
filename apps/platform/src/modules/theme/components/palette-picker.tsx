import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useEffect, useRef } from "react";

import { Button } from "@aven/ui/button";
import { ToggleGroup } from "@aven/ui/toggle-group";

import { PALETTES } from "../catalog";
import { useRailScroll } from "../hooks/use-rail-scroll";
import { useTheme } from "../hooks/use-theme";
import type { Palette } from "../types";
import { PaletteCard } from "./palette-card";

function revealCard(rail: HTMLElement, palette: Palette) {
  const card = rail.querySelector<HTMLElement>(`[data-palette="${palette}"]`);

  if (!card) return;

  rail.scrollLeft += card.getBoundingClientRect().left - rail.getBoundingClientRect().left - 4;
}

export function PalettePicker() {
  const { palette, resolvedTheme, setPalette } = useTheme();
  const rail = useRef<HTMLDivElement>(null);
  const { atStart, atEnd, onScroll, page } = useRailScroll(rail);

  useEffect(() => {
    if (rail.current) revealCard(rail.current, palette);
  }, [palette]);

  return (
    <div className="flex flex-col gap-3 border-b py-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 id="theme-palette-title" className="text-sm font-medium">
            Theme
          </h3>
          <p className="text-xs text-pretty text-muted-foreground">
            The colors of the app. Each card is the palette as it looks now.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous themes"
            disabled={atStart}
            onClick={() => page(-1)}
          >
            <IconChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next themes"
            disabled={atEnd}
            onClick={() => page(1)}
          >
            <IconChevronRight />
          </Button>
        </div>
      </div>
      <div
        ref={rail}
        onScroll={onScroll}
        className="snap-x snap-proximity overflow-x-auto p-1 [scrollbar-color:var(--input)_transparent] [scrollbar-width:thin]"
      >
        <ToggleGroup
          value={[palette]}
          onValueChange={([next]) => next && setPalette(next as Palette)}
          aria-label="Theme"
          className="w-max items-stretch gap-2.5"
        >
          {PALETTES.map((option) => (
            <PaletteCard key={option.id} option={option} mode={resolvedTheme} />
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
}
