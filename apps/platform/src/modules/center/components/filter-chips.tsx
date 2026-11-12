import { X } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import type { Chip } from "../types";

export function FilterChips({
  chips,
  onClear,
  name,
}: {
  chips: Chip[];
  onClear: () => void;
  name: string;
}) {
  if (chips.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={name}
      className="flex flex-nowrap items-center gap-1.5 overflow-x-auto border-b px-4 py-2 md:flex-wrap"
    >
      {chips.map((chip) => (
        <Button
          key={chip.key}
          variant="secondary"
          size="xs"
          onClick={chip.remove}
          aria-label={`Remove the filter ${chip.label}`}
          title="Remove this filter"
          className="h-6 shrink-0 gap-1 rounded-full pr-1.5"
        >
          {chip.label}
          <X className="size-3" />
        </Button>
      ))}
      {chips.length > 1 && (
        <Button
          variant="ghost"
          size="xs"
          onClick={onClear}
          className="h-6 shrink-0 text-muted-foreground"
        >
          Clear all
        </Button>
      )}
    </div>
  );
}
