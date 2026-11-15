import { Cloud, Monitor } from "@mynaui/icons-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@aven/ui/select";

import type { RuntimeChoice } from "../types";

type Props = {
  choices: RuntimeChoice[];
  value: string | undefined;
  onChange: (runtimeId: string) => void;
};

const labelOf = ({ runtime, note }: RuntimeChoice) =>
  note === "offline" ? `${runtime.name} (offline)` : runtime.name;

export function RuntimePicker({ choices, value, onChange }: Props) {
  return (
    <Select
      items={choices.map((choice) => ({ value: choice.runtime.id, label: labelOf(choice) }))}
      value={value ?? ""}
      onValueChange={(next) => next && onChange(next)}
    >
      <SelectTrigger
        size="sm"
        aria-label="Computer"
        className="max-w-48 min-w-0 border-0 bg-muted/50 px-2 text-muted-foreground dark:bg-muted/50"
      >
        <SelectValue placeholder="Choose a computer" />
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        align="start"
        className="w-auto min-w-(--anchor-width)"
      >
        {choices.map((choice) => (
          <SelectItem
            key={choice.runtime.id}
            value={choice.runtime.id}
            disabled={choice.disabled}
            title={choice.note ?? undefined}
          >
            <span className="flex min-w-0 items-center gap-2">
              {choice.runtime.isCloud ? (
                <Cloud className="text-muted-foreground" />
              ) : (
                <Monitor className="text-muted-foreground" />
              )}
              {labelOf(choice)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
